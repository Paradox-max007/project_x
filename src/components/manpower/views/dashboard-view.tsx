"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Activity,
  CalendarCheck,
  CalendarOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coffee,
  HardHat,
  Hourglass,
  LayoutDashboard,
  LogIn,
  MapPin,
  MapPinOff,
  Receipt,
  RefreshCw,
  ScrollText,
  Settings,
  Shirt,
  ShieldCheck,
  UserX,
  Users,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ErrorState,
  PageHeader,
} from "@/components/manpower/shared/page-kit";
import {
  StatCard,
  StatCardSkeleton,
} from "@/components/manpower/shared/stat-card";
import { ATTENDANCE_STATUS_META } from "@/components/manpower/shared/status-badges";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type {
  AppView,
  AttendanceStatus,
  AuditLogRecord,
  DashboardStats,
} from "@/types/manpower";

/** Chart colors per attendance status — readable in light & dark mode. */
const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "#10b981", // emerald
  absent: "#f43f5e", // rose
  leave: "#14b8a6", // teal
  overtime: "#f59e0b", // amber/orange
  no_site: "#71717a", // zinc-500
  not_marked: "#a1a1aa", // zinc-400
  holiday: "#d946ef", // fuchsia
};

const ENTITY_ICONS: Record<string, LucideIcon> = {
  employee: Users,
  employees: Users,
  site: MapPin,
  sites: MapPin,
  attendance: CalendarCheck,
  leave: CalendarOff,
  leave_request: CalendarOff,
  cancellation: UserX,
  cancellation_request: UserX,
  warning: AlertTriangle,
  fine: Receipt,
  uniform: Shirt,
  uniform_issue: Shirt,
  admin: ShieldCheck,
  admin_user: ShieldCheck,
  settings: Settings,
  auth: LogIn,
  session: LogIn,
};

function entityIcon(entity: string): LucideIcon {
  return ENTITY_ICONS[entity?.toLowerCase()] ?? Activity;
}

function prettyAction(action: string, entity: string): string {
  let a = (action ?? "").replace(/_/g, " ").trim();
  const prefix = (entity ?? "").replace(/_/g, " ").toLowerCase();
  if (prefix && a.toLowerCase().startsWith(prefix + " ")) {
    a = a.slice(prefix.length + 1);
  }
  if (!a) a = "Update";
  return a.replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Chart tooltip (light/dark friendly)
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
  isPie = false,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: { fill?: string } }[];
  label?: string | number;
  isPie?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {!isPie && label != null && (
        <p className="mb-1.5 font-semibold">
          {(() => {
            try {
              return format(parseISO(String(label)), "EEE, d MMM yyyy");
            } catch {
              return String(label);
            }
          })()}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color ?? p.payload?.fill }}
            />
            <span className="capitalize text-muted-foreground">{p.name}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums">
              {p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard view
// ---------------------------------------------------------------------------

export function DashboardView() {
  const navigate = useAppStore((s) => s.navigate);
  const setEmployeesPreset = useAppStore((s) => s.setEmployeesPreset);
  const user = useAppStore((s) => s.user);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<DashboardStats>("/api/dashboard");
      setStats(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load the dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const can = useCallback(
    (key: AppView) => user?.role === "super_admin" || user?.permissions?.[key] === true,
    [user]
  );

  const goTo = useCallback(
    (view: AppView, siteId?: string) => {
      if (!can(view)) return;
      if (siteId) setEmployeesPreset({ siteId });
      navigate(view, siteId ? { siteId } : undefined);
    },
    [can, navigate, setEmployeesPreset]
  );

  const today = useMemo(() => new Date(), []);

  // ---------------- stat cards ----------------
  const statCards = useMemo(() => {
    if (!stats) return [];
    const rating = Number.isFinite(stats.avgRating)
      ? `Avg rating ${stats.avgRating.toFixed(1)}★`
      : undefined;
    return [
      {
        label: "Total Employees",
        value: stats.totalEmployees,
        icon: Users,
        accent: "zinc" as const,
        hint: rating,
        view: "employees" as AppView,
      },
      {
        label: "Working",
        value: stats.working,
        icon: HardHat,
        accent: "emerald" as const,
        view: "employees" as AppView,
      },
      {
        label: "Idle",
        value: stats.idle,
        icon: Coffee,
        accent: "amber" as const,
        view: "employees" as AppView,
        siteId: "idle",
      },
      {
        label: "Active Sites",
        value: stats.activeSites,
        icon: MapPin,
        accent: "teal" as const,
        view: "sites" as AppView,
      },
      {
        label: "Inactive Sites",
        value: stats.inactiveSites,
        icon: MapPinOff,
        accent: "zinc" as const,
        view: "sites" as AppView,
      },
      {
        label: "Present Today",
        value: stats.presentToday,
        icon: CheckCircle2,
        accent: "emerald" as const,
        view: "attendance" as AppView,
      },
      {
        label: "Absent Today",
        value: stats.absentToday,
        icon: UserX,
        accent: "rose" as const,
        view: "attendance" as AppView,
      },
      {
        label: "On Leave Today",
        value: stats.onLeaveToday,
        icon: CalendarOff,
        accent: "teal" as const,
        view: "leave_requests" as AppView,
      },
      {
        label: "Overtime Today",
        value: stats.overtimeToday,
        icon: Clock,
        accent: "orange" as const,
        view: "attendance" as AppView,
      },
      {
        label: "Pending Leave",
        value: stats.pendingLeave,
        icon: Hourglass,
        accent: "amber" as const,
        view: "leave_requests" as AppView,
      },
      {
        label: "Pending Cancellation",
        value: stats.pendingCancellation,
        icon: UserX,
        accent: "rose" as const,
        view: "cancellation_requests" as AppView,
      },
      {
        label: "Upcoming Renewals",
        value: stats.upcomingUniformRenewals,
        icon: Shirt,
        accent: "orange" as const,
        view: "uniform_registry" as AppView,
      },
    ];
  }, [stats]);

  const trendData = useMemo(
    () =>
      (stats?.attendanceTrend ?? []).map((p) => ({
        ...p,
        label: (() => {
          try {
            return format(parseISO(p.date), "d MMM");
          } catch {
            return p.date;
          }
        })(),
      })),
    [stats]
  );

  const distribution = useMemo(
    () =>
      (stats?.todayDistribution ?? [])
        .filter((d) => (d.count ?? 0) > 0)
        .map((d) => ({
          ...d,
          label: ATTENDANCE_STATUS_META[d.status]?.label ?? d.status,
          color: STATUS_COLORS[d.status] ?? "#71717a",
        })),
    [stats]
  );

  const totalDist = distribution.reduce((sum, d) => sum + (d.count ?? 0), 0);

  const maxSiteCount = useMemo(
    () => Math.max(1, ...(stats?.siteBreakdown ?? []).map((s) => s.count ?? 0)),
    [stats]
  );

  // ---------------- loading ----------------
  if (loading && !stats) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-[360px] rounded-xl lg:col-span-3" />
          <Skeleton className="h-[360px] rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  // ---------------- error ----------------
  if (error && !stats) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Dashboard"
          description="Workforce, site and attendance overview"
          icon={LayoutDashboard}
        />
        <div className="mt-6">
          <ErrorState message={error} retry={load} />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Dashboard"
        description={`Workforce overview — ${format(today, "EEEE, d MMMM yyyy")}`}
        icon={LayoutDashboard}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="min-h-9"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* ---------------- stat cards ---------------- */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value ?? 0}
            icon={card.icon}
            accent={card.accent}
            hint={card.hint}
            onClick={can(card.view) ? () => goTo(card.view, card.siteId) : undefined}
          />
        ))}
      </div>

      {/* ---------------- charts row ---------------- */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* attendance trend */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Attendance trend</CardTitle>
            <CardDescription>
              Present, absent &amp; leave — last 14 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
                <CalendarCheck className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No attendance data recorded yet.
                </p>
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradLeave" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickMargin={8}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="present"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#gradPresent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="absent"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fill="url(#gradAbsent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="leave"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      fill="url(#gradLeave)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                  {(
                    [
                      ["present", "#10b981"],
                      ["absent", "#f43f5e"],
                      ["leave", "#14b8a6"],
                    ] as const
                  ).map(([key, color]) => (
                    <span
                      key={key}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: color }}
                      />
                      <span className="capitalize">{key}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* today's distribution */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today&apos;s distribution</CardTitle>
            <CardDescription>Attendance status across the workforce</CardDescription>
          </CardHeader>
          <CardContent>
            {distribution.length === 0 ? (
              <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
                <PieIconFallback />
                <p className="text-sm text-muted-foreground">
                  Nothing marked for today yet.
                </p>
              </div>
            ) : (
              <>
                <div className="relative h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="62%"
                        outerRadius="88%"
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {distribution.map((d) => (
                          <Cell key={d.status} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip isPie />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-bold tabular-nums">{totalDist}</p>
                    <p className="text-[11px] text-muted-foreground">marked today</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  {distribution.map((d) => (
                    <span
                      key={d.status}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: d.color }}
                      />
                      {d.label}
                      <span className="font-semibold text-foreground">
                        {d.count}
                      </span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- bottom row ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* site breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Site breakdown</CardTitle>
            <CardDescription>
              Active employees per site — click to view the roster
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.siteBreakdown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active sites with assigned employees.
              </p>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {stats.siteBreakdown.map((site) => {
                  const isIdle =
                    site.siteId === "idle" ||
                    !site.siteId ||
                    site.name?.toLowerCase() === "idle";
                  return (
                    <button
                      key={site.siteId ?? site.name}
                      type="button"
                      onClick={() =>
                        goTo("employees", isIdle ? "idle" : site.siteId)
                      }
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                        can("employees")
                          ? "hover:bg-accent/60"
                          : "cursor-default"
                      )}
                    >
                      {isIdle ? (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Coffee className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                          <MapPin className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {site.name}
                          </span>
                          <span className="text-sm font-bold tabular-nums">
                            {site.count}
                          </span>
                        </span>
                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              isIdle ? "bg-amber-500" : "bg-emerald-500"
                            )}
                            style={{
                              width: `${Math.max(
                                3,
                                ((site.count ?? 0) / maxSiteCount) * 100
                              )}%`,
                            }}
                          />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* recent activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Latest actions across the system</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No activity recorded yet.
              </p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto pr-1">
                {stats.recentActivity.map((entry: AuditLogRecord) => {
                  const Icon = entityIcon(entry.entity);
                  return (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {prettyAction(entry.action, entry.entity)}
                          <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">
                            {entry.entity}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.actorName || "System"} ·{" "}
                          {safeRelative(entry.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* pending actions */}
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pending actions</CardTitle>
            <CardDescription>Items waiting for a decision</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(
              [
                {
                  view: "leave_requests" as AppView,
                  icon: CalendarOff,
                  label: "Leave requests",
                  count: stats.pendingLeave,
                  box: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                },
                {
                  view: "cancellation_requests" as AppView,
                  icon: UserX,
                  label: "Cancellation requests",
                  count: stats.pendingCancellation,
                  box: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                },
                {
                  view: "uniform_registry" as AppView,
                  icon: Shirt,
                  label: "Uniform renewals (30d)",
                  count: stats.upcomingUniformRenewals,
                  box: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
                },
              ] as const
            ).map((row) => {
              const allowed = can(row.view);
              return (
                <button
                  key={row.view}
                  type="button"
                  disabled={!allowed}
                  onClick={() => goTo(row.view)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left transition-colors",
                    allowed
                      ? "hover:border-primary/40 hover:bg-accent/50"
                      : "cursor-not-allowed opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      row.box
                    )}
                  >
                    <row.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {row.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {row.count} pending
                    </span>
                  </span>
                  {allowed && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
            {can("audit_logs") && (
              <Badge variant="outline" className="w-full justify-center py-1.5 text-[11px] text-muted-foreground">
                <ScrollText className="mr-1 h-3 w-3" />
                Every action is recorded in the audit log
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PieIconFallback() {
  return <Activity className="h-8 w-8 text-muted-foreground/50" />;
}

export default DashboardView;
