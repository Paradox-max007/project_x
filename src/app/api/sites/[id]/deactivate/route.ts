import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import { deactivateSiteCascade } from "@/lib/employee-site-api";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/sites/[id]/deactivate (permission: sites)
// Sets isActive=false, unassigns its employees (back to idle pool, closing
// their open site history with reason "Site deactivated") and clears team
// leadership. Historical attendance + site history are preserved.
// Returns { ok: true, reassignedEmployees: n }.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requirePermission(req, "sites");
  if (error) return error;
  const { id } = await ctx.params;

  const site = await db.site.findUnique({ where: { id } });
  if (!site) return fail("Site not found", 404);
  if (!site.isActive) return fail("Site is already inactive", 400);

  const reassignedEmployees = await db.$transaction((tx) =>
    deactivateSiteCascade(tx, id)
  );

  await logAudit({
    actor: user,
    action: "site.deactivate",
    entity: "site",
    entityId: id,
    before: { name: site.name, isActive: true, teamLeaderId: site.teamLeaderId },
    after: { isActive: false, unassignedEmployees: reassignedEmployees },
  });

  return ok({ ok: true, reassignedEmployees });
}
