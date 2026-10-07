import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, notify, logAudit, superAdminIds } from "@/lib/api-helpers";
import {
  CANCELLATION_STATUSES,
  paginationOf,
  parseWith,
  routeGuard,
} from "@/lib/ops-helpers";
import { CANCELLATION_INCLUDE, toCancellationRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/cancellation-requests?status&query&page&pageSize
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "cancellation_requests");
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const status = url.searchParams.get("status")?.trim() ?? "";
    const query = url.searchParams.get("query")?.trim() ?? "";
    const { page, pageSize, skip, take } = paginationOf(url, 10);

    if (status && !(CANCELLATION_STATUSES as readonly string[]).includes(status)) {
      return fail("Invalid status filter", 400);
    }

    const where: Prisma.CancellationRequestWhereInput = {};
    if (status) where.status = status;
    if (query) {
      where.OR = [
        { employee: { fullName: { contains: query } } },
        { employee: { employeeCode: { contains: query } } },
        { reason: { contains: query } },
      ];
    }

    const [total, rows] = await Promise.all([
      db.cancellationRequest.count({ where }),
      db.cancellationRequest.findMany({
        where,
        include: CANCELLATION_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return ok({ data: rows.map(toCancellationRecord), total, page, pageSize });
  });
}

// ---------------------------------------------------------------------------
// POST /api/cancellation-requests — request employee deletion
// Employee must be active; status becomes pending_deletion until review.
// ---------------------------------------------------------------------------

const createSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  reason: z.string().min(1, "Reason is required").max(500, "Reason must be 500 characters or fewer"),
});

export async function POST(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "cancellation_requests");
    if (auth.error) return auth.error;

    const { data: body, error: parseError } = await parseWith(req, createSchema);
    if (parseError) return parseError;

    const employee = await db.employee.findUnique({
      where: { id: body.employeeId },
      include: { currentSite: { select: { name: true } } },
    });
    if (!employee) return fail("Employee not found", 404);
    if (employee.status === "pending_deletion") {
      return fail("Employee already has a pending cancellation request", 400);
    }
    if (employee.status !== "active") return fail("Employee is not active", 400);

    const created = await db.$transaction(async (tx) => {
      const request = await tx.cancellationRequest.create({
        data: {
          employeeId: employee.id,
          reason: body.reason,
          status: "pending",
          requestedByName: auth.user.fullName,
        },
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: { status: "pending_deletion" },
      });
      return request;
    });

    await notify({
      recipientIds: (await superAdminIds()).filter((id) => id !== auth.user.id),
      type: "cancellation_request",
      title: "Cancellation request submitted",
      message: `${auth.user.fullName} requested deletion of employee ${employee.fullName} (${employee.employeeCode}). Super Admin review required.`,
      referenceType: "cancellation_request",
      referenceId: created.id,
    });

    await logAudit({
      actor: auth.user,
      action: "cancellation.request",
      entity: "cancellation_request",
      entityId: created.id,
      after: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        reason: body.reason,
      },
    });

    return ok(
      toCancellationRecord({
        ...created,
        employee: {
          fullName: employee.fullName,
          employeeCode: employee.employeeCode,
          currentSite: employee.currentSite,
        },
      })
    );
  });
}
