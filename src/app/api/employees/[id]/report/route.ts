import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok, requirePermission } from "@/lib/api-helpers";
import {
  buildAttendanceSummary,
  employeeSiteInclude,
  toEmployeeProfile,
  toFineRecord,
  toHistoryEntry,
  toLeaveRequestRecord,
  toUniformIssueRecord,
  toWarningRecord,
} from "@/lib/employee-site-api";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/employees/[id]/report — full employee report (permission: employees)
// profile (masked) + all-time attendance summary + warnings + fines +
// uniforms (document number masked) + approved leave history + site history
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requirePermission(req, "employees");
  if (error) return error;
  const { id } = await ctx.params;

  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      ...employeeSiteInclude,
      siteHistory: {
        orderBy: { startDate: "desc" },
        include: { site: { select: { name: true } } },
      },
      warnings: { orderBy: { createdAt: "desc" } },
      fines: { orderBy: { createdAt: "desc" } },
      leaveRequests: {
        where: { status: "approved" },
        orderBy: { startDate: "desc" },
      },
      uniformIssues: {
        orderBy: { issuedAt: "desc" },
        include: {
          site: { select: { name: true } },
          items: { include: { item: { select: { name: true } } } },
        },
      },
    },
  });
  if (!employee) return fail("Employee not found", 404);

  const groups = await db.attendance.groupBy({
    by: ["status"],
    where: { employeeId: id },
    _count: { _all: true },
    _sum: { overtimeHours: true },
  });

  return ok({
    employee: toEmployeeProfile(employee),
    attendanceSummary: buildAttendanceSummary(
      groups.map((g) => ({
        status: g.status,
        count: g._count._all,
        overtimeHours: g._sum.overtimeHours,
      }))
    ),
    warnings: employee.warnings.map((w) => toWarningRecord(w, employee)),
    fines: employee.fines.map((f) => toFineRecord(f, employee)),
    uniforms: employee.uniformIssues.map((u) =>
      toUniformIssueRecord(u, employee, { maskDocumentNumber: true })
    ),
    leaveHistory: employee.leaveRequests.map((l) =>
      toLeaveRequestRecord(l, employee)
    ),
    siteHistory: employee.siteHistory.map((h) => toHistoryEntry(h)),
  });
}
