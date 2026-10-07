import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import { decryptField } from "@/lib/crypto";
import { getSettings, parseWith, routeGuard } from "@/lib/ops-helpers";
import { UNIFORM_ISSUE_INCLUDE, toUniformIssueRecord } from "@/lib/ops-serializers";
import { issueUniform, resolveUniformItems } from "@/lib/uniform-service";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/uniform-issues/[id]/renew
// Creates a NEW issue record linked to the previous one (isRenewal=true,
// previousIssueId set) with fresh codes, token and renewal window. The old
// record stays intact.
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  quantity: z
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
});

const renewSchema = z.object({
  documentNumber: z.string().min(1, "Document number is required").max(100).optional(),
  items: z.array(itemSchema).min(1, "At least one uniform item is required").optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "uniform_registry");
    if (auth.error) return auth.error;

    const { id } = await params;

    const { data: body, error: parseError } = await parseWith(req, renewSchema);
    if (parseError) return parseError;

    const previous = await db.uniformIssue.findUnique({
      where: { id },
      include: { employee: true, items: true },
    });
    if (!previous) return fail("Uniform issue not found", 404);

    if (previous.employee.status !== "active") {
      return fail("Employee is not active", 400);
    }

    // Document number: provided or reused from the previous issue.
    const documentNumber = body.documentNumber ?? decryptField(previous.documentNumber) ?? "";
    if (!documentNumber) return fail("A document number is required", 400);

    // Items: provided or copied from the previous issue.
    let items: { itemId: string; quantity: number }[] | null;
    if (body.items) {
      items = await resolveUniformItems(body.items);
      if (!items) return fail("One or more uniform items are invalid", 400);
    } else {
      items = previous.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity }));
      if (items.length === 0) return fail("The previous issue has no items to copy", 400);
    }

    // Site stays the same as the previous issue.
    let teamLeaderName: string | null = previous.teamLeaderName;
    if (previous.siteId) {
      const site = await db.site.findUnique({
        where: { id: previous.siteId },
        include: { teamLeader: { select: { fullName: true } } },
      });
      teamLeaderName = site?.teamLeader?.fullName ?? null;
    }

    const settings = await getSettings();
    const issueId = await issueUniform({
      employeeId: previous.employeeId,
      documentType: previous.documentType,
      documentNumber,
      siteId: previous.siteId,
      teamLeaderName,
      items,
      isRenewal: true,
      previousIssueId: previous.id,
      renewalMonths: settings.uniformRenewalMonths,
      createdByName: auth.user.fullName,
    });

    const full = await db.uniformIssue.findUniqueOrThrow({
      where: { id: issueId },
      include: UNIFORM_ISSUE_INCLUDE,
    });

    await logAudit({
      actor: auth.user,
      action: "uniform.renew",
      entity: "uniform_issue",
      entityId: issueId,
      before: { previousIssueId: previous.id, previousCode: previous.uniformCode },
      after: {
        uniformCode: full.uniformCode,
        tokenNumber: full.tokenNumber,
        renewalDate: full.renewalDate.toISOString(),
      },
    });

    // Creator sees the full document number.
    return ok(toUniformIssueRecord(full, { maskDocument: false }));
  });
}
