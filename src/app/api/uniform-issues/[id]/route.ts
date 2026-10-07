import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import { routeGuard } from "@/lib/ops-helpers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// DELETE /api/uniform-issues/[id]
// Blocked (409) when the record has been renewed — delete the renewal first.
// Otherwise deletes the issue (items cascade).
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "uniform_registry");
    if (auth.error) return auth.error;

    const { id } = await params;

    const issue = await db.uniformIssue.findUnique({ where: { id } });
    if (!issue) return fail("Uniform issue not found", 404);

    const renewals = await db.uniformIssue.count({ where: { previousIssueId: id } });
    if (renewals > 0) {
      return fail("Renewed records cannot be deleted — delete the renewal instead", 409);
    }

    await db.uniformIssue.delete({ where: { id } });

    await logAudit({
      actor: auth.user,
      action: "uniform.delete",
      entity: "uniform_issue",
      entityId: id,
      before: {
        uniformCode: issue.uniformCode,
        tokenNumber: issue.tokenNumber,
        employeeId: issue.employeeId,
      },
    });

    return ok({ ok: true });
  });
}
