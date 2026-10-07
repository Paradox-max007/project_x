import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import {
  isUniqueViolation,
  readJson,
  siteCreateSchema,
  toSiteRecord,
  zodErrorMessage,
} from "@/lib/employee-site-api";

// ---------------------------------------------------------------------------
// GET /api/sites?includeInactive=true — list sites (permission: sites)
// Default: active sites only. employeeCount = ACTIVE employees assigned.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { error } = await requirePermission(req, "sites");
  if (error) return error;

  const includeInactive =
    req.nextUrl.searchParams.get("includeInactive") === "true";

  const [sites, counts] = await Promise.all([
    db.site.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { teamLeader: { select: { fullName: true } } },
      orderBy: { name: "asc" },
    }),
    db.employee.groupBy({
      by: ["currentSiteId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
  ]);
  const countMap = new Map(
    counts.map((c) => [c.currentSiteId as string, c._count._all])
  );

  return ok(sites.map((s) => toSiteRecord(s, countMap.get(s.id) ?? 0)));
}

// ---------------------------------------------------------------------------
// POST /api/sites — create (permission: sites)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { user, error } = await requirePermission(req, "sites");
  if (error) return error;

  const json = await readJson(req);
  if (!json.ok) return fail("Invalid JSON body", 400);
  const parsed = siteCreateSchema.safeParse(json.body);
  if (!parsed.success) return fail(zodErrorMessage(parsed.error), 400);
  const input = parsed.data;

  const existing = await db.site.findUnique({ where: { name: input.name } });
  if (existing) return fail(`A site named "${input.name}" already exists`, 409);

  // A leader must be an employee assigned to THIS site — impossible at
  // creation time, so reject instead of storing an invalid reference.
  if (input.teamLeaderId) {
    return fail("Team leader must be an assigned employee of this site", 400);
  }

  let site;
  try {
    site = await db.site.create({
      data: {
        name: input.name,
        clientName: input.clientName,
        projectName: input.projectName,
        isActive: input.isActive ?? true,
      },
      include: { teamLeader: { select: { fullName: true } } },
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return fail(`A site named "${input.name}" already exists`, 409);
    }
    throw e;
  }

  await logAudit({
    actor: user,
    action: "site.create",
    entity: "site",
    entityId: site.id,
    after: {
      name: site.name,
      clientName: site.clientName,
      projectName: site.projectName,
      isActive: site.isActive,
    },
  });

  return ok(toSiteRecord(site, 0));
}
