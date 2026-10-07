import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok, requirePermission } from "@/lib/api-helpers";
import {
  employeeSiteInclude,
  toEmployeeRow,
} from "@/lib/employee-site-api";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/sites/[id]/employees — active employees assigned to a site
// (permission: sites) → EmployeeRow[]
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requirePermission(req, "sites");
  if (error) return error;
  const { id } = await ctx.params;

  const site = await db.site.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!site) return fail("Site not found", 404);

  const employees = await db.employee.findMany({
    where: { currentSiteId: id, status: "active" },
    include: employeeSiteInclude,
    orderBy: { fullName: "asc" },
  });

  return ok(employees.map(toEmployeeRow));
}
