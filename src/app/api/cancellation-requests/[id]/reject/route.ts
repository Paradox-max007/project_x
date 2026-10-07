import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, requireUser, notify, logAudit } from "@/lib/api-helpers";
import { parseWith, reviewAudience, routeGuard } from "@/lib/ops-helpers";
import { CANCELLATION_INCLUDE, toCancellationRecord } from "@/lib/ops-serializers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/cancellation-requests/[id]/reject — SUPER ADMIN ONLY
// Employee restored to active status.
// ---------------------------------------------------------------------------

const rejectSchema = z.object({
  note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return routeGuard(async () => {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;
    if (auth.user.role !== "super_admin") {
      return fail("Only the Super Admin can review cancellation requests", 403);
    }

    const { id } = await params;

    const { data: body, error: parseError } = await parseWith(req, rejectSchema);
    if (parseError) return parseError;

    const request = await db.cancellationRequest.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!request) return fail("Cancellation request not found", 404);
    if (request.status !== "pending") {
      return fail("Only pending requests can be rejected", 400);
    }

    const employee = request.employee;

    await db.$transaction(async (tx) => {
      await tx.cancellationRequest.update({
        where: { id: request.id },
        data: {
          status: "rejected",
          reviewedByName: auth.user.fullName,
          reviewedAt: new Date(),
        },
      });
      // Restore the employee unless it was deleted through another flow.
      if (employee.status === "pending_deletion") {
        await tx.employee.update({
          where: { id: employee.id },
          data: { status: "active" },
        });
      }
    });

    await notify({
      recipientIds: await reviewAudience("cancellation_requests", auth.user.id),
      type: "cancellation_request",
      title: "Cancellation rejected",
      message: `${auth.user.fullName} rejected the deletion request for ${employee.fullName} (${employee.employeeCode}). The employee remains active.${
        body.note ? ` Note: ${body.note}` : ""
      }`,
      referenceType: "cancellation_request",
      referenceId: request.id,
    });

    await logAudit({
      actor: auth.user,
      action: "cancellation.reject",
      entity: "cancellation_request",
      entityId: request.id,
      before: { status: "pending" },
      after: { status: "rejected", note: body.note ?? null },
    });

    const updated = await db.cancellationRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: CANCELLATION_INCLUDE,
    });
    return ok(toCancellationRecord(updated));
  });
}
