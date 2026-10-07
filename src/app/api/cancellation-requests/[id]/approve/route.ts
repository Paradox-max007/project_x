import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireUser, notify, logAudit } from "@/lib/api-helpers";
import { reviewAudience, routeGuard } from "@/lib/ops-helpers";
import { CANCELLATION_INCLUDE, toCancellationRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/cancellation-requests/[id]/approve — SUPER ADMIN ONLY
// Employee status -> deleted, unassigned from site, leadership cleared.
// All history (attendance / warnings / fines / leave / uniforms / site
// history) is preserved.
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;
    if (auth.user.role !== "super_admin") {
      return fail("Only the Super Admin can review cancellation requests", 403);
    }

    const { id } = await params;

    const request = await db.cancellationRequest.findUnique({
      where: { id },
      include: { employee: { include: { leaderOfSite: true } } },
    });
    if (!request) return fail("Cancellation request not found", 404);
    if (request.status !== "pending") {
      return fail("Only pending requests can be approved", 400);
    }

    const employee = request.employee;

    await db.$transaction(async (tx) => {
      await tx.cancellationRequest.update({
        where: { id: request.id },
        data: {
          status: "approved",
          reviewedByName: auth.user.fullName,
          reviewedAt: new Date(),
        },
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: { status: "deleted", currentSiteId: null },
      });
      await tx.employeeSiteHistory.updateMany({
        where: { employeeId: employee.id, endDate: null },
        data: { endDate: new Date(), reason: "Employee cancellation approved" },
      });
      if (employee.leaderOfSite) {
        await tx.site.update({
          where: { id: employee.leaderOfSite.id },
          data: { teamLeaderId: null },
        });
      }
    });

    await notify({
      recipientIds: await reviewAudience("cancellation_requests", auth.user.id),
      type: "cancellation_request",
      title: "Cancellation approved",
      message: `${auth.user.fullName} approved the deletion of ${employee.fullName} (${employee.employeeCode}). The employee record is now marked as deleted.`,
      referenceType: "cancellation_request",
      referenceId: request.id,
    });

    await logAudit({
      actor: auth.user,
      action: "cancellation.approve",
      entity: "cancellation_request",
      entityId: request.id,
      before: { status: "pending" },
      after: {
        status: "approved",
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        historyPreserved: true,
      },
    });

    const updated = await db.cancellationRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: CANCELLATION_INCLUDE,
    });
    return ok(toCancellationRecord(updated));
  });
}
