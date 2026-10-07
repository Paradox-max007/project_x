import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requirePermission } from "@/lib/api-helpers";
import {
  ATTENDANCE_STATUSES,
  currentMonthStr,
  monthRange,
  routeGuard,
} from "@/lib/ops-helpers";
import type { AttendanceStatus, DayStatus } from "@/types/manpower";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/attendance/calendar?employeeId&month=YYYY-MM
// Single-employee month view (days map + per-status summary).
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "attendance");
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId")?.trim() ?? "";
    if (!employeeId) return fail("employeeId is required", 400);

    const month = url.searchParams.get("month")?.trim() || currentMonthStr();
    const range = monthRange(month);
    if (!range) return fail("Invalid month format (expected YYYY-MM)", 400);

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, fullName: true },
    });
    if (!employee) return fail("Employee not found", 404);

    const rows = await db.attendance.findMany({
      where: {
        employeeId: employee.id,
        attendanceDate: { gte: range.start, lt: range.end },
      },
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true, status: true, overtimeHours: true, notes: true },
    });

    const days: Record<string, DayStatus> = {};
    const counts = new Map<string, number>();
    let totalOvertimeHours = 0;
    for (const row of rows) {
      days[String(row.attendanceDate.getUTCDate())] = {
        status: row.status as AttendanceStatus,
        overtimeHours: row.overtimeHours,
        notes: row.notes,
      };
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
      totalOvertimeHours += row.overtimeHours ?? 0;
    }

    const summary = ATTENDANCE_STATUSES.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));

    return ok({
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      month,
      daysInMonth: range.daysInMonth,
      days,
      summary,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      totalMarked: rows.length,
    });
  });
}
