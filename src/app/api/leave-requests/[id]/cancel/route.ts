import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import { routeGuard } from "@/lib/ops-helpers";
import { LEAVE_INCLUDE, toLeaveRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/leave-requests/[id]/cancel — pending only (by the requester)
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "leave_requests");
    if (auth.error) return auth.error;

    const { id } = await params;

    const request = await db.leaveRequest.findUnique({
      where: { id },
      include: LEAVE_INCLUDE,
    });
    if (!request) return fail("Leave request not found", 404);
    if (request.status !== "pending") {
      return fail("Only pending requests can be cancelled", 400);
    }

    await db.leaveRequest.update({
      where: { id: request.id },
      data: { status: "cancelled" },
    });

    await logAudit({
      actor: auth.user,
      action: "leave.cancel",
      entity: "leave_request",
      entityId: request.id,
      before: { status: "pending" },
      after: { status: "cancelled" },
    });

    const updated = await db.leaveRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: LEAVE_INCLUDE,
    });
    return ok(toLeaveRecord(updated));
  });
}
