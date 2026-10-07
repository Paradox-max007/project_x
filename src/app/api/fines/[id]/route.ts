import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import { round2, routeGuard } from "@/lib/ops-helpers";

export const dynamic = "force-dynamic";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// DELETE /api/fines/[id]
// Undo window: within 5 minutes of creation, by the creator or a super admin.
// Deletes the fine and restores the rating (capped at 5).
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "fines");
    if (auth.error) return auth.error;

    const { id } = await params;

    const fine = await db.fine.findUnique({
      where: { id },
      include: { employee: { select: { id: true, rating: true } } },
    });
    if (!fine) return fail("Fine not found", 404);

    const withinWindow = Date.now() - fine.createdAt.getTime() <= FIVE_MINUTES_MS;
    const isOwner = fine.createdByName === auth.user.fullName;
    const isSuperAdmin = auth.user.role === "super_admin";
    if (!withinWindow || (!isOwner && !isSuperAdmin)) {
      return fail("Fines can only be removed shortly after creation", 403);
    }

    const restoredRating = Math.min(5, round2(fine.employee.rating + fine.ratingPenalty));

    await db.$transaction(async (tx) => {
      await tx.fine.delete({ where: { id: fine.id } });
      await tx.employee.update({
        where: { id: fine.employee.id },
        data: { rating: restoredRating },
      });
    });

    await logAudit({
      actor: auth.user,
      action: "fine.delete",
      entity: "fine",
      entityId: fine.id,
      before: {
        employeeId: fine.employeeId,
        reason: fine.reason,
        amount: fine.amount,
        ratingPenalty: fine.ratingPenalty,
      },
      after: { restoredRating },
    });

    return ok({ ok: true, restoredRating });
  });
}
