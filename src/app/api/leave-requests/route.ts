import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, notify, logAudit } from "@/lib/api-helpers";
import {
  LEAVE_TYPES,
  LEAVE_STATUSES,
  paginationOf,
  parseWith,
  reviewAudience,
  routeGuard,
  ymdToDate,
  zYmd,
} from "@/lib/ops-helpers";
import { LEAVE_INCLUDE, toLeaveRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/leave-requests?status&query&page&pageSize
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "leave_requests");
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const status = url.searchParams.get("status")?.trim() ?? "";
    const query = url.searchParams.get("query")?.trim() ?? "";
    const { page, pageSize, skip, take } = paginationOf(url, 10);

    if (status && !(LEAVE_STATUSES as readonly string[]).includes(status)) {
      return fail("Invalid status filter", 400);
    }

    const where: Prisma.LeaveRequestWhereInput = {};
    if (status) where.status = status;
    if (query) {
      where.OR = [
        { employee: { fullName: { contains: query, mode: "insensitive" } } },
        { employee: { employeeCode: { contains: query, mode: "insensitive" } } },
        { reason: { contains: query, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      db.leaveRequest.count({ where }),
      db.leaveRequest.findMany({
        where,
        include: LEAVE_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return ok({ data: rows.map(toLeaveRecord), total, page, pageSize });
  });
}

// ---------------------------------------------------------------------------
// POST /api/leave-requests — create a pending leave request
// ---------------------------------------------------------------------------

const createSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  leaveType: z.enum(LEAVE_TYPES, { error: "Invalid leave type" }),
  otherType: z.string().max(100, "Other type is too long").nullable().optional(),
  startDate: zYmd,
  endDate: zYmd,
  reason: z.string().max(500, "Reason must be 500 characters or fewer").nullable().optional(),
});

export async function POST(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "leave_requests");
    if (auth.error) return auth.error;

    const { data: body, error: parseError } = await parseWith(req, createSchema);
    if (parseError) return parseError;

    const start = ymdToDate(body.startDate);
    const end = ymdToDate(body.endDate);
    if (!start || !end) return fail("Invalid date (expected YYYY-MM-DD)", 400);
    if (end.getTime() < start.getTime()) {
      return fail("End date cannot be before start date", 400);
    }
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (totalDays > 366) return fail("Leave period cannot exceed 366 days", 400);

    const employee = await db.employee.findUnique({
      where: { id: body.employeeId },
      select: { id: true, fullName: true, employeeCode: true, status: true },
    });
    if (!employee) return fail("Employee not found", 404);
    if (employee.status !== "active") return fail("Employee is not active", 400);

    const created = await db.leaveRequest.create({
      data: {
        employeeId: employee.id,
        leaveType: body.leaveType,
        otherType: body.leaveType === "other" ? body.otherType ?? null : null,
        startDate: start,
        endDate: end,
        totalDays,
        reason: body.reason ?? null,
        status: "pending",
        createdByName: auth.user.fullName,
      },
    });

    const label = body.leaveType === "other" ? body.otherType || "other" : body.leaveType;
    await notify({
      recipientIds: await reviewAudience("leave_requests", auth.user.id),
      type: "leave_request",
      title: "New leave request",
      message: `${auth.user.fullName} submitted a ${label} leave request for ${employee.fullName} (${employee.employeeCode}) — ${totalDays} day(s) starting ${body.startDate}.`,
      referenceType: "leave_request",
      referenceId: created.id,
    });

    await logAudit({
      actor: auth.user,
      action: "leave.create",
      entity: "leave_request",
      entityId: created.id,
      after: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        leaveType: body.leaveType,
        startDate: body.startDate,
        endDate: body.endDate,
        totalDays,
      },
    });

    return ok(
      toLeaveRecord({
        ...created,
        employee: { fullName: employee.fullName, employeeCode: employee.employeeCode },
      })
    );
  });
}
