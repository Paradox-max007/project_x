import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, requirePermission } from "@/lib/api-helpers";
import {
  getSettings,
  paginationOf,
  parseWith,
  reviewAudience,
  round2,
  routeGuard,
} from "@/lib/ops-helpers";
import { FINE_INCLUDE, toFineRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/fines?query&employeeId&page&pageSize
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "fines");
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim() ?? "";
    const employeeId = url.searchParams.get("employeeId")?.trim() ?? "";
    const { page, pageSize, skip, take } = paginationOf(url, 10);

    const where: Prisma.FineWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (query) {
      where.OR = [
        { employee: { fullName: { contains: query, mode: "insensitive" } } },
        { employee: { employeeCode: { contains: query, mode: "insensitive" } } },
        { reason: { contains: query, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      db.fine.count({ where }),
      db.fine.findMany({
        where,
        include: FINE_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return ok({ data: rows.map(toFineRecord), total, page, pageSize });
  });
}

// ---------------------------------------------------------------------------
// POST /api/fines — issue a fine (rating penalty in transaction)
// ---------------------------------------------------------------------------

const createSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  reason: z.string().min(1, "Reason is required").max(500, "Reason must be 500 characters or fewer"),
  amount: z.number({ error: "Amount must be a number" }).min(0, "Amount must be zero or greater"),
  currency: z.string().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "fines");
    if (auth.error) return auth.error;

    const { data: body, error: parseError } = await parseWith(req, createSchema);
    if (parseError) return parseError;

    const employee = await db.employee.findUnique({
      where: { id: body.employeeId },
      select: { id: true, fullName: true, employeeCode: true, rating: true, status: true },
    });
    if (!employee) return fail("Employee not found", 404);
    if (employee.status !== "active") return fail("Employee is not active", 400);

    const settings = await getSettings();
    const currency = body.currency ?? settings.currency;
    const penalty = settings.fineRatingPenalty;
    const newRating = Math.max(0, round2(employee.rating - penalty));
    const recipients = await reviewAudience("fines", auth.user.id);

    const created = await db.$transaction(async (tx) => {
      const fine = await tx.fine.create({
        data: {
          employeeId: employee.id,
          reason: body.reason,
          amount: body.amount,
          currency,
          ratingPenalty: penalty,
          createdByName: auth.user.fullName,
        },
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: { rating: newRating },
      });
      if (recipients.length > 0) {
        await tx.notification.createMany({
          data: recipients.map((recipientId) => ({
            recipientId,
            type: "fine",
            title: "Fine issued",
            message: `${auth.user.fullName} issued a ${currency} ${body.amount} fine to ${employee.fullName} (${employee.employeeCode}).`,
            referenceType: "fine",
            referenceId: fine.id,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,
          actorName: auth.user.fullName,
          action: "fine.create",
          entity: "fine",
          entityId: fine.id,
          before: JSON.stringify({ rating: employee.rating }),
          after: JSON.stringify({
            employeeId: employee.id,
            employeeCode: employee.employeeCode,
            amount: body.amount,
            currency,
            newRating,
          }),
        },
      });
      return fine;
    });

    return ok({
      ...toFineRecord({
        ...created,
        employee: { fullName: employee.fullName, employeeCode: employee.employeeCode },
      }),
      newRating,
    });
  });
}
