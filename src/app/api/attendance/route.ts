import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import {
  ATTENDANCE_STATUSES,
  currentMonthStr,
  monthRange,
  paginationOf,
  parseWith,
  routeGuard,
  ymdToDate,
  zYmd,
} from "@/lib/ops-helpers";
import type { AttendanceRow, AttendanceStatus, DayStatus } from "@/types/manpower";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/attendance?month=YYYY-MM&siteId&query&page&pageSize
// Month view: one row per active employee with a day-of-month status map.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "attendance");
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const month = url.searchParams.get("month")?.trim() || currentMonthStr();
    const range = monthRange(month);
    if (!range) return fail("Invalid month format (expected YYYY-MM)", 400);

    const siteId = url.searchParams.get("siteId")?.trim() ?? "";
    const query = url.searchParams.get("query")?.trim() ?? "";
    const { page, pageSize, skip, take } = paginationOf(url, 15);

    const employeeWhere: Prisma.EmployeeWhereInput = { status: "active" };
    if (siteId === "idle") employeeWhere.currentSiteId = null;
    else if (siteId) employeeWhere.currentSiteId = siteId;
    if (query) {
      employeeWhere.OR = [
        { fullName: { contains: query, mode: "insensitive" } },
        { employeeCode: { contains: query, mode: "insensitive" } },
        { position: { contains: query, mode: "insensitive" } },
      ];
    }

    const [total, employees] = await Promise.all([
      db.employee.count({ where: employeeWhere }),
      db.employee.findMany({
        where: employeeWhere,
        orderBy: { employeeCode: "asc" },
        skip,
        take,
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          position: true,
          nationality: true,
          currentSiteId: true,
          currentSite: { select: { name: true } },
        },
      }),
    ]);

    const pageIds = employees.map((e) => e.id);
    const monthFilter = { attendanceDate: { gte: range.start, lt: range.end } };

    const [pageRows, monthRows] = await Promise.all([
      pageIds.length
        ? db.attendance.findMany({
            where: { employeeId: { in: pageIds }, ...monthFilter },
            select: {
              employeeId: true,
              attendanceDate: true,
              status: true,
              overtimeHours: true,
              notes: true,
            },
          })
        : Promise.resolve([]),
      // Summary covers ALL matching employees, not just the current page.
      db.attendance.findMany({
        where: { employee: employeeWhere, ...monthFilter },
        select: { status: true },
      }),
    ]);

    const daysByEmployee = new Map<string, Record<string, DayStatus>>();
    for (const row of pageRows) {
      const days = daysByEmployee.get(row.employeeId) ?? {};
      days[String(row.attendanceDate.getUTCDate())] = {
        status: row.status as AttendanceStatus,
        overtimeHours: row.overtimeHours,
        notes: row.notes,
      };
      daysByEmployee.set(row.employeeId, days);
    }

    const data: AttendanceRow[] = employees.map((employee) => ({
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      position: employee.position,
      nationality: employee.nationality,
      siteId: employee.currentSiteId,
      siteName: employee.currentSite?.name ?? null,
      days: daysByEmployee.get(employee.id) ?? {},
    }));

    const counts = new Map<string, number>();
    for (const row of monthRows) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }
    const summary = ATTENDANCE_STATUSES.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));

    return ok({
      data,
      total,
      page,
      pageSize,
      month,
      daysInMonth: range.daysInMonth,
      summary,
    });
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/attendance — upsert a single employee/day
// ---------------------------------------------------------------------------

const upsertSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  date: zYmd,
  status: z.enum(ATTENDANCE_STATUSES, { error: "Invalid attendance status" }),
  overtimeHours: z.number().nullable().optional(),
  notes: z.string().max(500, "Notes must be 500 characters or fewer").nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "attendance");
    if (auth.error) return auth.error;

    const { data: body, error: parseError } = await parseWith(req, upsertSchema);
    if (parseError) return parseError;

    const date = ymdToDate(body.date);
    if (!date) return fail("Invalid date (expected YYYY-MM-DD)", 400);

    let overtimeHours: number | null = null;
    if (body.status === "overtime") {
      if (body.overtimeHours === null || body.overtimeHours === undefined || body.overtimeHours <= 0) {
        return fail("Overtime hours must be greater than zero when status is overtime", 400);
      }
      overtimeHours = body.overtimeHours;
    }

    const employee = await db.employee.findUnique({
      where: { id: body.employeeId },
      select: { id: true, employeeCode: true, status: true, currentSiteId: true },
    });
    if (!employee) return fail("Employee not found", 404);
    if (employee.status !== "active") return fail("Employee is not active", 400);

    const notes = body.notes ?? null;
    const row = await db.attendance.upsert({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate: date,
        },
      },
      update: {
        status: body.status,
        overtimeHours,
        notes,
        siteId: employee.currentSiteId,
        updatedByName: auth.user.fullName,
      },
      create: {
        employeeId: employee.id,
        siteId: employee.currentSiteId,
        attendanceDate: date,
        status: body.status,
        overtimeHours,
        notes,
        createdByName: auth.user.fullName,
        updatedByName: auth.user.fullName,
      },
    });

    await logAudit({
      actor: auth.user,
      action: "attendance.mark",
      entity: "attendance",
      entityId: row.id,
      after: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        date: body.date,
        status: body.status,
        overtimeHours,
      },
    });

    return ok({ ok: true });
  });
}
