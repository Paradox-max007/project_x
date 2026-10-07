import "server-only";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/crypto";
import { addMonthsUtc } from "@/lib/ops-helpers";

/**
 * Uniform issue creation service shared by POST /api/uniform-issues and the
 * renew endpoint: sequential code/token generation with unique-violation
 * retry, plus transactional issue + items creation.
 */

export type UniformItemInput = { itemId: string; quantity: number };

export type IssueUniformParams = {
  employeeId: string;
  documentType: string;
  documentNumber: string;
  siteId: string | null;
  teamLeaderName: string | null;
  items: UniformItemInput[];
  isRenewal: boolean;
  previousIssueId: string | null;
  renewalMonths: number;
  createdByName: string;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

async function maxCodeNumbers(): Promise<{ uniform: number; token: number }> {
  const rows = await db.uniformIssue.findMany({
    select: { uniformCode: true, tokenNumber: true },
  });
  let uniform = 0;
  let token = 0;
  for (const row of rows) {
    const u = /^UN-(\d+)$/.exec(row.uniformCode)?.[1];
    if (u) uniform = Math.max(uniform, parseInt(u, 10));
    const t = /^TKN-(\d+)$/.exec(row.tokenNumber)?.[1];
    if (t) token = Math.max(token, parseInt(t, 10));
  }
  return { uniform, token };
}

/**
 * Validate + merge the requested items (dedupe itemId collisions) and verify
 * every item exists. Returns null when the item list is invalid.
 */
export async function resolveUniformItems(
  items: UniformItemInput[]
): Promise<UniformItemInput[] | null> {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.itemId, (merged.get(item.itemId) ?? 0) + item.quantity);
  }
  const ids = [...merged.keys()];
  if (ids.length === 0) return null;
  const found = await db.uniformItem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) return null;
  return ids.map((itemId) => ({ itemId, quantity: merged.get(itemId) as number }));
}

/** Create the issue (and its items) transactionally; returns the new issue id. */
export async function issueUniform(params: IssueUniformParams): Promise<string> {
  const base = await maxCodeNumbers();
  const issuedAt = new Date();
  const renewalDate = addMonthsUtc(issuedAt, params.renewalMonths);

  for (let attempt = 0; ; attempt++) {
    const uniformCode = `UN-${String(base.uniform + 1 + attempt).padStart(4, "0")}`;
    const tokenNumber = `TKN-${String(base.token + 1 + attempt).padStart(4, "0")}`;
    try {
      const issue = await db.$transaction(async (tx) => {
        const created = await tx.uniformIssue.create({
          data: {
            uniformCode,
            tokenNumber,
            employeeId: params.employeeId,
            documentType: params.documentType,
            documentNumber: encryptField(params.documentNumber) ?? "",
            siteId: params.siteId,
            teamLeaderName: params.teamLeaderName,
            isRenewal: params.isRenewal,
            previousIssueId: params.previousIssueId,
            issuedAt,
            renewalDate,
            createdByName: params.createdByName,
          },
        });
        await tx.uniformIssueItem.createMany({
          data: params.items.map((item) => ({
            issueId: created.id,
            itemId: item.itemId,
            quantity: item.quantity,
          })),
        });
        return created;
      });
      return issue.id;
    } catch (error) {
      // Someone else grabbed the code in the meantime — bump and retry.
      if (isUniqueViolation(error) && attempt < 9) continue;
      throw error;
    }
  }
}
