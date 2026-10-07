import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import {
  assignEmployeeToSite,
  employeeAssignSchema,
  readJson,
  zodErrorMessage,
} from "@/lib/employee-site-api";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/employees/[id]/assign — move to site / idle pool
// body: { siteId: string | null, reason?: string }  (permission: employees)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requirePermission(req, "employees");
  if (error) return error;
  const { id } = await ctx.params;

  const json = await readJson(req);
  if (!json.ok) return fail("Invalid JSON body", 400);
  const parsed = employeeAssignSchema.safeParse(json.body);
  if (!parsed.success) return fail(zodErrorMessage(parsed.error), 400);
  const input = parsed.data;

  const result = await db.$transaction((tx) =>
    assignEmployeeToSite(tx, {
      employeeId: id,
      siteId: input.siteId ?? null,
      reason: input.reason ?? null,
      createdByName: user.fullName,
    })
  );
  if (!result.ok) return fail(result.message, result.status);

  await logAudit({
    actor: user,
    action: "employee.assign_site",
    entity: "employee",
    entityId: id,
    before: { siteName: result.previousSiteName },
    after: { siteName: result.newSiteName, reason: input.reason ?? null },
  });

  return ok({
    ok: true,
    employeeCode: result.employeeCode,
    siteName: result.newSiteName,
  });
}
