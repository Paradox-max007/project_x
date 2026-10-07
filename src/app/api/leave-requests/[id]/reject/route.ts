import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, notify, logAudit } from "@/lib/api-helpers";
import { parseWith, reviewAudience, routeGuard } from "@/lib/ops-helpers";
import { LEAVE_INCLUDE, toLeaveRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/leave-requests/[id]/reject — pending only
// ---------------------------------------------------------------------------

const rejectSchema = z.object({
  note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "leave_requests");
    if (auth.error) return auth.error;

    const { id } = await params;

    const { data: body, error: parseError } = await parseWith(req, rejectSchema);
    if (parseError) return parseError;

    const request = await db.leaveRequest.findUnique({
      where: { id },
      include: LEAVE_INCLUDE,
    });
    if (!request) return fail("Leave request not found", 404);
    if (request.status !== "pending") {
      return fail("Only pending requests can be rejected", 400);
    }

    await db.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        reviewedByName: auth.user.fullName,
        reviewedAt: new Date(),
      },
    });

    await notify({
      recipientIds: await reviewAudience("leave_requests", auth.user.id),
      type: "leave_request",
      title: "Leave request rejected",
      message: `${auth.user.fullName} rejected the ${request.leaveType} leave request for ${request.employee.fullName} (${request.employee.employeeCode}).${
        body.note ? ` Note: ${body.note}` : ""
      }`,
      referenceType: "leave_request",
      referenceId: request.id,
    });

    await logAudit({
      actor: auth.user,
      action: "leave.reject",
      entity: "leave_request",
      entityId: request.id,
      before: { status: "pending" },
      after: { status: "rejected", note: body.note ?? null },
    });

    const updated = await db.leaveRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: LEAVE_INCLUDE,
    });
    return ok(toLeaveRecord(updated));
  });
}
