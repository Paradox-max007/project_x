import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, notify, logAudit } from "@/lib/api-helpers";
import { addDays, reviewAudience, routeGuard } from "@/lib/ops-helpers";
import { LEAVE_INCLUDE, toLeaveRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/leave-requests/[id]/approve
// Pending only. Writes `leave` attendance rows for every date in the range.
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
      include: { employee: true },
    });
    if (!request) return fail("Leave request not found", 404);
    if (request.status !== "pending") {
      return fail("Only pending requests can be approved", 400);
    }
    if (request.employee.status === "deleted") {
      return fail("Employee has been deleted", 400);
    }

    const employee = request.employee;

    await db.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: "approved",
          reviewedByName: auth.user.fullName,
          reviewedAt: new Date(),
        },
      });
      // Upsert a `leave` attendance row for every calendar day in the range.
      let cursor = new Date(request.startDate.getTime());
      while (cursor.getTime() <= request.endDate.getTime()) {
        await tx.attendance.upsert({
          where: {
            employeeId_attendanceDate: {
              employeeId: employee.id,
              attendanceDate: cursor,
            },
          },
          update: {
            status: "leave",
            overtimeHours: null,
            siteId: employee.currentSiteId,
            updatedByName: auth.user.fullName,
          },
          create: {
            employeeId: employee.id,
            siteId: employee.currentSiteId,
            attendanceDate: cursor,
            status: "leave",
            createdByName: auth.user.fullName,
            updatedByName: auth.user.fullName,
          },
        });
        cursor = addDays(cursor, 1);
      }
    });

    await notify({
      recipientIds: await reviewAudience("leave_requests", auth.user.id),
      type: "leave_request",
      title: "Leave request approved",
      message: `${auth.user.fullName} approved the ${request.leaveType} leave request for ${employee.fullName} (${employee.employeeCode}) — ${request.totalDays} day(s).`,
      referenceType: "leave_request",
      referenceId: request.id,
    });

    await logAudit({
      actor: auth.user,
      action: "leave.approve",
      entity: "leave_request",
      entityId: request.id,
      before: { status: "pending" },
      after: {
        status: "approved",
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        attendanceDaysWritten: request.totalDays,
      },
    });

    const updated = await db.leaveRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: LEAVE_INCLUDE,
    });
    return ok(toLeaveRecord(updated));
  });
}
