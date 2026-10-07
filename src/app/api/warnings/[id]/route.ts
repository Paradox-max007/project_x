import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import { round2, routeGuard } from "@/lib/ops-helpers";

export const dynamic = "force-dynamic";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// DELETE /api/warnings/[id]
// Undo window: within 5 minutes of creation, by the creator or a super admin.
// Deletes the warning and restores the rating (capped at 5).
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "warnings");
    if (auth.error) return auth.error;

    const { id } = await params;

    const warning = await db.warning.findUnique({
      where: { id },
      include: { employee: { select: { id: true, rating: true } } },
    });
    if (!warning) return fail("Warning not found", 404);

    const withinWindow = Date.now() - warning.createdAt.getTime() <= FIVE_MINUTES_MS;
    const isOwner = warning.createdByName === auth.user.fullName;
    const isSuperAdmin = auth.user.role === "super_admin";
    if (!withinWindow || (!isOwner && !isSuperAdmin)) {
      return fail("Warnings can only be removed shortly after creation", 403);
    }

    const restoredRating = Math.min(5, round2(warning.employee.rating + warning.ratingPenalty));

    await db.$transaction(async (tx) => {
      await tx.warning.delete({ where: { id: warning.id } });
      await tx.employee.update({
        where: { id: warning.employee.id },
        data: { rating: restoredRating },
      });
    });

    await logAudit({
      actor: auth.user,
      action: "warning.delete",
      entity: "warning",
      entityId: warning.id,
      before: {
        employeeId: warning.employeeId,
        reason: warning.reason,
        ratingPenalty: warning.ratingPenalty,
      },
      after: { restoredRating },
    });

    return ok({ ok: true, restoredRating });
  });
}
