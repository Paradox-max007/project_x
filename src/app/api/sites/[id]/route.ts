import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import {
  deactivateSiteCascade,
  getSiteRecord,
  isUniqueViolation,
  readJson,
  siteUpdateSchema,
  zodErrorMessage,
} from "@/lib/employee-site-api";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// PATCH /api/sites/[id] — partial update (permission: sites)
// teamLeaderId (non-null) must be an ACTIVE employee currently assigned to
// THIS site. Deactivating via PATCH runs the same cascade as /deactivate.
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requirePermission(req, "sites");
  if (error) return error;
  const { id } = await ctx.params;

  const before = await db.site.findUnique({
    where: { id },
    include: { teamLeader: { select: { fullName: true } } },
  });
  if (!before) return fail("Site not found", 404);

  const json = await readJson(req);
  if (!json.ok) return fail("Invalid JSON body", 400);
  const parsed = siteUpdateSchema.safeParse(json.body);
  if (!parsed.success) return fail(zodErrorMessage(parsed.error), 400);
  const input = parsed.data;

  if (input.name !== undefined && input.name !== before.name) {
    const dup = await db.site.findUnique({ where: { name: input.name } });
    if (dup) return fail(`A site named "${input.name}" already exists`, 409);
  }

  const deactivating = input.isActive === false && before.isActive;
  if (deactivating && input.teamLeaderId) {
    return fail("Cannot set a team leader while deactivating a site", 400);
  }

  if (input.teamLeaderId) {
    const leader = await db.employee.findUnique({
      where: { id: input.teamLeaderId },
    });
    if (
      !leader ||
      leader.currentSiteId !== id ||
      leader.status !== "active"
    ) {
      return fail(
        "Team leader must be an assigned employee of this site",
        400
      );
    }
  }

  const data: Prisma.SiteUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.clientName !== undefined) data.clientName = input.clientName;
  if (input.projectName !== undefined) data.projectName = input.projectName;
  if (input.teamLeaderId !== undefined) data.teamLeaderId = input.teamLeaderId; // null clears leadership
  if (input.isActive === true) data.isActive = true;

  let unassignedCount = 0;
  if (deactivating) {
    unassignedCount = await db.$transaction(async (tx) => {
      const n = await deactivateSiteCascade(tx, id);
      if (Object.keys(data).length > 0) {
        await tx.site.update({ where: { id }, data });
      }
      return n;
    });
  } else if (Object.keys(data).length > 0) {
    try {
      await db.site.update({ where: { id }, data });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return fail(`A site named "${input.name}" already exists`, 409);
      }
      throw e;
    }
  }

  const after = await getSiteRecord(id);
  if (!after) return fail("Site not found after update", 500);

  await logAudit({
    actor: user,
    action: "site.update",
    entity: "site",
    entityId: id,
    before: {
      name: before.name,
      clientName: before.clientName,
      projectName: before.projectName,
      isActive: before.isActive,
      teamLeaderId: before.teamLeaderId,
      teamLeaderName: before.teamLeader?.fullName ?? null,
    },
    after: {
      name: after.name,
      clientName: after.clientName,
      projectName: after.projectName,
      isActive: after.isActive,
      teamLeaderId: after.teamLeaderId,
      teamLeaderName: after.teamLeaderName,
      ...(deactivating ? { unassignedEmployees: unassignedCount } : {}),
    },
  });

  return ok(after);
}

// ---------------------------------------------------------------------------
// DELETE /api/sites/[id] — only allowed when the site was NEVER used
// (no EmployeeSiteHistory rows). Otherwise 409: deactivate instead so the
// historical records (attendance / site history) are preserved.
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requirePermission(req, "sites");
  if (error) return error;
  const { id } = await ctx.params;

  const site = await db.site.findUnique({ where: { id } });
  if (!site) return fail("Site not found", 404);

  const historyCount = await db.employeeSiteHistory.count({
    where: { siteId: id },
  });
  if (historyCount > 0) {
    return fail(
      "Site has assignment history — deactivate it instead to preserve records",
      409
    );
  }

  await db.$transaction(async (tx) => {
    // Site was never used for assignments — clean any stray references.
    await tx.attendance.deleteMany({ where: { siteId: id } });
    const issues = await tx.uniformIssue.findMany({
      where: { siteId: id },
      select: { id: true },
    });
    if (issues.length > 0) {
      await tx.uniformIssueItem.deleteMany({
        where: { issueId: { in: issues.map((i) => i.id) } },
      });
      await tx.uniformIssue.deleteMany({ where: { siteId: id } });
    }
    await tx.site.delete({ where: { id } });
  });

  await logAudit({
    actor: user,
    action: "site.delete",
    entity: "site",
    entityId: id,
    before: {
      name: site.name,
      clientName: site.clientName,
      projectName: site.projectName,
      isActive: site.isActive,
    },
  });

  return ok({ ok: true });
}
