import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import { decryptField } from "@/lib/crypto";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/employees/[id]/documents/reveal?field=passport_number|id_number
// Returns the FULL decrypted document number (permission: employees).
// The audit log records WHICH field was revealed — never the value itself.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requirePermission(req, "employees");
  if (error) return error;
  const { id } = await ctx.params;

  const field = req.nextUrl.searchParams.get("field");
  if (field !== "passport_number" && field !== "id_number") {
    return fail(
      'The "field" query parameter must be either "passport_number" or "id_number"',
      400
    );
  }

  const employee = await db.employee.findUnique({ where: { id } });
  if (!employee) return fail("Employee not found", 404);

  const value =
    field === "passport_number"
      ? decryptField(employee.passportNumber)
      : decryptField(employee.idNumber);

  await logAudit({
    actor: user,
    action: "employee.reveal_document",
    entity: "employee",
    entityId: id,
    after: { field, employeeCode: employee.employeeCode },
  });

  return ok({ value });
}
