import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import {
  ATTENDANCE_STATUSES,
  parseWith,
  routeGuard,
  ymdToDate,
  zYmd,
} from "@/lib/ops-helpers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/attendance/bulk — mark one day for a whole site or employee list
// ---------------------------------------------------------------------------

const bulkSchema = z.object({
  siteId: z.string().nullable().optional(),
  employeeIds: z.array(z.string().min(1)).optional(),
  date: zYmd,
  status: z.enum(ATTENDANCE_STATUSES, { error: "Invalid attendance status" }),
  overtimeHours: z.number().nullable().optional(),
});

export async function POST(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "attendance");
    if (auth.error) return auth.error;

    const { data: body, error: parseError } = await parseWith(req, bulkSchema);
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

    let employees: { id: string; currentSiteId: string | null }[];
    let targetDescription: string;

    if (body.employeeIds && body.employeeIds.length > 0) {
      const ids = [...new Set(body.employeeIds)];
      employees = await db.employee.findMany({
        where: { id: { in: ids }, status: "active" },
        select: { id: true, currentSiteId: true },
      });
      targetDescription = `${employees.length} selected employee(s)`;
    } else if (body.siteId) {
      const idle = body.siteId === "idle";
      employees = await db.employee.findMany({
        where: {
          status: "active",
          ...(idle ? { currentSiteId: null } : { currentSiteId: body.siteId }),
        },
        select: { id: true, currentSiteId: true },
      });
      let siteName = "Unassigned (idle)";
      if (!idle) {
        const site = await db.site.findUnique({
          where: { id: body.siteId },
          select: { name: true },
        });
        if (site) siteName = site.name;
      }
      targetDescription = `site ${siteName}`;
    } else {
      return fail("Provide a siteId or a list of employeeIds to mark", 400);
    }

    for (const employee of employees) {
      await db.attendance.upsert({
        where: {
          employeeId_attendanceDate: {
            employeeId: employee.id,
            attendanceDate: date,
          },
        },
        update: {
          status: body.status,
          overtimeHours,
          siteId: employee.currentSiteId,
          updatedByName: auth.user.fullName,
        },
        create: {
          employeeId: employee.id,
          siteId: employee.currentSiteId,
          attendanceDate: date,
          status: body.status,
          overtimeHours,
          createdByName: auth.user.fullName,
          updatedByName: auth.user.fullName,
        },
      });
    }

    await logAudit({
      actor: auth.user,
      action: "attendance.bulk_mark",
      entity: "attendance",
      after: {
        target: targetDescription,
        date: body.date,
        status: body.status,
        overtimeHours,
        updated: employees.length,
      },
    });

    return ok({ updated: employees.length });
  });
}
