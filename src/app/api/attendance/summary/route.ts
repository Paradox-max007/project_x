import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, requirePermission } from "@/lib/api-helpers";
import {
  ATTENDANCE_STATUSES,
  currentMonthStr,
  monthRange,
  routeGuard,
} from "@/lib/ops-helpers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/attendance/summary?month=YYYY-MM&siteId
// Month summary for charts: per-status counts + per-site breakdown.
// ---------------------------------------------------------------------------

type SiteBucket = { siteName: string; present: number; absent: number; overtime: number; leave: number };

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "attendance");
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const month = url.searchParams.get("month")?.trim() || currentMonthStr();
    const range = monthRange(month);
    if (!range) return fail("Invalid month format (expected YYYY-MM)", 400);

    const siteId = url.searchParams.get("siteId")?.trim() ?? "";

    const employeeWhere: Prisma.EmployeeWhereInput = { status: "active" };
    if (siteId === "idle") employeeWhere.currentSiteId = null;
    else if (siteId) employeeWhere.currentSiteId = siteId;

    const [rows, sites] = await Promise.all([
      db.attendance.findMany({
        where: {
          attendanceDate: { gte: range.start, lt: range.end },
          employee: employeeWhere,
        },
        select: { status: true, siteId: true },
      }),
      db.site.findMany({
        where: siteId && siteId !== "idle" ? { id: siteId } : { isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }
    const summary = ATTENDANCE_STATUSES.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));

    // Per-site buckets keyed by the site recorded on the attendance row
    // (site at time of marking); null rows fall into "Unassigned".
    const buckets = new Map<string, SiteBucket>();
    const bucketFor = (key: string, siteName: string): SiteBucket => {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { siteName, present: 0, absent: 0, overtime: 0, leave: 0 };
        buckets.set(key, bucket);
      }
      return bucket;
    };
    for (const site of sites) {
      bucketFor(site.id, site.name);
    }
    for (const row of rows) {
      const key = row.siteId ?? "__unassigned__";
      const bucket = bucketFor(key, "Unassigned");
      if (row.status === "present") bucket.present += 1;
      else if (row.status === "absent") bucket.absent += 1;
      else if (row.status === "overtime") bucket.overtime += 1;
      else if (row.status === "leave") bucket.leave += 1;
    }

    const siteNames = new Map(sites.map((s) => [s.id, s.name]));
    const bySite = [...buckets.entries()].map(([key, bucket]) => ({
      siteName: key === "__unassigned__" ? "Unassigned" : siteNames.get(key) ?? bucket.siteName,
      present: bucket.present,
      absent: bucket.absent,
      overtime: bucket.overtime,
      leave: bucket.leave,
    }));

    return ok({ month, summary, bySite });
  });
}
