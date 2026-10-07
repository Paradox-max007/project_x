import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-helpers";
import type {
  AttendanceStatus,
  AuditLogRecord,
  DashboardStats,
} from "@/types/manpower";

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 14;

/** Fixed display order for the "today distribution" pie. */
const ALL_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "no_site",
  "overtime",
  "not_marked",
  "leave",
  "holiday",
];

/** Calendar days are stored as UTC midnight — key them as YYYY-MM-DD. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/dashboard — permission: "dashboard"
 * Aggregated manpower KPIs for the logged-in administrator.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requirePermission(req, "dashboard");
  if (error) return error;
  void user;

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const trendStart = new Date(today.getTime() - (TREND_DAYS - 1) * DAY_MS);
  const renewalLimit = new Date(today.getTime() + 30 * DAY_MS);

  const [
    totalEmployees,
    working,
    ratingAgg,
    activeSites,
    inactiveSites,
    activeSiteRows,
    employeesBySite,
    todayByStatus,
    trendRows,
    pendingLeave,
    pendingCancellation,
    upcomingUniformRenewals,
    recentLogs,
  ] = await Promise.all([
    db.employee.count({ where: { status: "active" } }),
    db.employee.count({
      where: { status: "active", currentSiteId: { not: null } },
    }),
    db.employee.aggregate({
      _avg: { rating: true },
      where: { status: "active" },
    }),
    db.site.count({ where: { isActive: true } }),
    db.site.count({ where: { isActive: false } }),
    db.site.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.employee.groupBy({
      by: ["currentSiteId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    db.attendance.groupBy({
      by: ["status"],
      where: { attendanceDate: today },
      _count: { _all: true },
    }),
    db.attendance.groupBy({
      by: ["attendanceDate", "status"],
      where: { attendanceDate: { gte: trendStart, lte: today } },
      _count: { _all: true },
    }),
    db.leaveRequest.count({ where: { status: "pending" } }),
    db.cancellationRequest.count({ where: { status: "pending" } }),
    db.uniformIssue.count({
      where: { renewalDate: { gte: today, lte: renewalLimit } },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const idle = totalEmployees - working;
  const countBySite = new Map<string, number>();
  for (const row of employeesBySite) {
    if (row.currentSiteId) {
      countBySite.set(row.currentSiteId, row._count._all);
    }
  }

  const siteBreakdown: DashboardStats["siteBreakdown"] = activeSiteRows.map(
    (s) => ({
      siteId: s.id,
      name: s.name,
      count: countBySite.get(s.id) ?? 0,
    })
  );
  siteBreakdown.push({ siteId: "idle", name: "Idle", count: idle });

  const todayStatusCount = new Map<string, number>();
  for (const row of todayByStatus) {
    todayStatusCount.set(row.status, row._count._all);
  }

  // Seed the 14-day window (ascending) with zeroes so charts have no gaps.
  const trendMap = new Map<
    string,
    { present: number; absent: number; leave: number; overtime: number }
  >();
  for (let i = 0; i < TREND_DAYS; i++) {
    trendMap.set(dateKey(new Date(trendStart.getTime() + i * DAY_MS)), {
      present: 0,
      absent: 0,
      leave: 0,
      overtime: 0,
    });
  }
  for (const row of trendRows) {
    const point = trendMap.get(dateKey(row.attendanceDate));
    if (!point) continue;
    const count = row._count._all;
    if (row.status === "present") point.present += count;
    else if (row.status === "absent") point.absent += count;
    else if (row.status === "leave") point.leave += count;
    else if (row.status === "overtime") point.overtime += count;
  }

  const recentActivity: AuditLogRecord[] = recentLogs.map((log) => ({
    id: log.id,
    actorName: log.actorName,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    before: log.before,
    after: log.after,
    createdAt: log.createdAt.toISOString(),
  }));

  const avg = ratingAgg._avg.rating;

  const stats: DashboardStats = {
    totalEmployees,
    working,
    idle,
    activeSites,
    inactiveSites,
    presentToday: todayStatusCount.get("present") ?? 0,
    absentToday: todayStatusCount.get("absent") ?? 0,
    onLeaveToday: todayStatusCount.get("leave") ?? 0,
    overtimeToday: todayStatusCount.get("overtime") ?? 0,
    pendingLeave,
    pendingCancellation,
    upcomingUniformRenewals,
    avgRating: avg == null ? 0 : Math.round(avg * 100) / 100,
    siteBreakdown,
    attendanceTrend: [...trendMap.entries()].map(([date, v]) => ({
      date,
      ...v,
    })),
    todayDistribution: ALL_ATTENDANCE_STATUSES.map((status) => ({
      status,
      count: todayStatusCount.get(status) ?? 0,
    })),
    recentActivity,
  };

  return ok(stats);
}
