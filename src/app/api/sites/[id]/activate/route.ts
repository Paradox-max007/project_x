import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import { getSiteRecord } from "@/lib/employee-site-api";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/sites/[id]/activate — re-activate a site (permission: sites)
// Returns the updated SiteRecord.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requirePermission(req, "sites");
  if (error) return error;
  const { id } = await ctx.params;

  const site = await db.site.findUnique({ where: { id } });
  if (!site) return fail("Site not found", 404);
  if (site.isActive) return fail("Site is already active", 400);

  await db.site.update({ where: { id }, data: { isActive: true } });

  const record = await getSiteRecord(id);
  if (!record) return fail("Site not found after activation", 500);

  await logAudit({
    actor: user,
    action: "site.activate",
    entity: "site",
    entityId: id,
    before: { name: site.name, isActive: false },
    after: { name: record.name, isActive: true },
  });

  return ok(record);
}
