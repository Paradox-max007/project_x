"use client";

import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarCheck,
  CalendarOff,
  CheckCheck,
  ChevronDown,
  HardHat,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Shirt,
  Sun,
  SunMoon,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/manpower/shared/page-kit";
import { notifMeta, notifTargetView } from "@/components/manpower/notif-meta";
import { apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { AppView, AuthUser, NotificationRecord } from "@/types/manpower";

// ---------------------------------------------------------------------------
// View registry — named exports from the view stub files (stable contract).
// Other agents own the contents; names will not change.
// ---------------------------------------------------------------------------

const Views: Record<AppView, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: lazy(() =>
    import("./views/dashboard-view").then((m) => ({ default: m.DashboardView }))
  ),
  employees: lazy(() =>
    import("./views/employees-view").then((m) => ({ default: m.EmployeesView }))
  ),
  sites: lazy(() =>
    import("./views/sites-view").then((m) => ({ default: m.SitesView }))
  ),
  attendance: lazy(() =>
    import("./views/attendance-view").then((m) => ({ default: m.AttendanceView }))
  ),
  leave_requests: lazy(() =>
    import("./views/leave-view").then((m) => ({ default: m.LeaveView }))
  ),
  cancellation_requests: lazy(() =>
    import("./views/cancellations-view").then((m) => ({ default: m.CancellationsView }))
  ),
  warnings: lazy(() =>
    import("./views/warnings-view").then((m) => ({ default: m.WarningsView }))
  ),
  fines: lazy(() =>
    import("./views/fines-view").then((m) => ({ default: m.FinesView }))
  ),
  uniform_registry: lazy(() =>
    import("./views/uniforms-view").then((m) => ({ default: m.UniformsView }))
  ),
  notifications: lazy(() =>
    import("./views/notifications-view").then((m) => ({ default: m.NotificationsView }))
  ),
  administrators: lazy(() =>
    import("./views/administrators-view").then((m) => ({ default: m.AdministratorsView }))
  ),
  audit_logs: lazy(() =>
    import("./views/audit-view").then((m) => ({ default: m.AuditView }))
  ),
  settings: lazy(() =>
    import("./views/settings-view").then((m) => ({ default: m.SettingsView }))
  ),
};

const VIEW_TITLES: Record<AppView, string> = {
  dashboard: "Dashboard",
  employees: "Employees",
  sites: "Sites",
  attendance: "Attendance",
  leave_requests: "Leave Requests",
  cancellation_requests: "Cancellations",
  warnings: "Warnings",
  fines: "Fines",
  uniform_registry: "Uniform Registry",
  notifications: "Notifications",
  administrators: "Administrators",
  audit_logs: "Audit Logs",
  settings: "Settings",
};

type NavItem = { key: AppView; label: string; icon: LucideIcon };

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "employees", label: "Employees", icon: Users },
      { key: "sites", label: "Sites", icon: MapPin },
      { key: "attendance", label: "Attendance", icon: CalendarCheck },
    ],
  },
  {
    label: "Requests",
    items: [
      { key: "leave_requests", label: "Leave Requests", icon: CalendarOff },
      { key: "cancellation_requests", label: "Cancellations", icon: UserX },
      { key: "warnings", label: "Warnings", icon: AlertTriangle },
      { key: "fines", label: "Fines", icon: Receipt },
    ],
  },
  {
    label: "Operations",
    items: [{ key: "uniform_registry", label: "Uniform Registry", icon: Shirt }],
  },
  {
    label: "Administration",
    items: [
      { key: "notifications", label: "Notifications", icon: Bell },
      { key: "administrators", label: "Administrators", icon: ShieldCheck },
      { key: "audit_logs", label: "Audit Logs", icon: ScrollText },
      { key: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const SIDEBAR_COLLAPSE_KEY = "asm.sidebar.collapsed";

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Sidebar navigation (shared by desktop rail and mobile drawer)
// ---------------------------------------------------------------------------

function NavButton({
  item,
  active,
  collapsed,
  badge,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  onClick: () => void;
}) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        active
          ? "bg-emerald-500/15 text-emerald-300 shadow-[inset_2px_0_0_0_#34d399]"
          : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100",
        collapsed && "justify-center px-0"
      )}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}
      {showBadge &&
        (collapsed ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-400 ring-2 ring-zinc-900" />
        ) : (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
            {badge! > 99 ? "99+" : badge}
          </span>
        ))}
    </button>
  );
}

function SidebarNav({
  view,
  user,
  collapsed,
  unreadCount,
  onNavigate,
}: {
  view: AppView;
  user: AuthUser;
  collapsed: boolean;
  unreadCount: number;
  onNavigate: (view: AppView) => void;
}) {
  const can = useCallback(
    (key: AppView) =>
      user.role === "super_admin" || user.permissions?.[key] === true,
    [user]
  );

  return (
    <nav
      aria-label="Main navigation"
      className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3"
    >
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) => can(i.key));
        if (items.length === 0) return null;
        return (
          <div key={section.label} className="pb-1">
            {!collapsed && (
              <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {section.label}
              </p>
            )}
            {collapsed && <div className="mx-3 my-3 border-t border-zinc-800" />}
            <div className="space-y-0.5">
              {items.map((item) => (
                <NavButton
                  key={item.key}
                  item={item}
                  active={view === item.key}
                  collapsed={collapsed}
                  badge={item.key === "notifications" ? unreadCount : undefined}
                  onClick={() => onNavigate(item.key)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex h-16 shrink-0 items-center gap-3 border-b border-zinc-800 px-4",
        collapsed && "justify-center px-0"
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-zinc-950 shadow-lg shadow-emerald-950/40">
        <HardHat className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-white">
            ASM Manpower
          </p>
          <p className="truncate text-[11px] text-zinc-400">
            Manpower Solutions
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header widgets
// ---------------------------------------------------------------------------

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // AppShell only renders client-side (after the session boot effect in
  // page.tsx), so resolvedTheme is available without a hydration guard.
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Sun
        className={cn(
          "h-[18px] w-[18px] transition-transform duration-300",
          dark ? "scale-100 rotate-0" : "scale-0 -rotate-90 absolute"
        )}
      />
      <Moon
        className={cn(
          "h-[18px] w-[18px] transition-transform duration-300",
          dark ? "scale-0 rotate-90 absolute" : "scale-100 rotate-0"
        )}
      />
    </Button>
  );
}

function UserMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open user menu"
          className="flex h-10 items-center gap-2 rounded-full pl-1 pr-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-2"
        >
          <Avatar className="h-8 w-8 border border-border/80">
            <AvatarFallback className="bg-emerald-500/10 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {initialsOf(user.fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
            {user.fullName}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:inline" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{user.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            {user.role === "super_admin" ? "Super Admin" : "Administrator"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon className="mr-1 h-4 w-4" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme ?? "light"}
              onValueChange={(v) => setTheme(v)}
            >
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-1.5 h-4 w-4" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-1.5 h-4 w-4" /> Dark
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onLogout()}>
          <LogOut className="mr-1.5 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsBell({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const unreadCount = useAppStore((s) => s.unreadCount);
  const notifVersion = useAppStore((s) => s.notifVersion);
  const bumpNotifVersion = useAppStore((s) => s.bumpNotifVersion);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<NotificationRecord[]>("/api/notifications");
      setItems(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchList();
  }, [open, notifVersion, fetchList]);

  const openNotification = async (n: NotificationRecord) => {
    setOpen(false);
    if (!n.read) {
      try {
        await apiPost(`/api/notifications/${n.id}/read`);
        bumpNotifVersion();
      } catch {
        /* non-fatal */
      }
    }
    onNavigate(notifTargetView(n.referenceType));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiPost("/api/notifications/read-all");
      bumpNotifVersion();
      await fetchList();
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not mark notifications as read"
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const hasUnread = (items ?? []).some((n) => !n.read);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10"
          aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <motion.span
              key={unreadCount}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={!hasUnread || markingAll}
            onClick={markAllRead}
          >
            {markingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            Mark all read
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && items === null ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <BellOff className="h-7 w-7 text-muted-foreground/60" />
              <p className="text-sm font-medium">No notifications</p>
              <p className="text-xs text-muted-foreground">
                You&apos;re all caught up for now.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = notifMeta(n.type);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60",
                        !n.read && "bg-emerald-500/[0.06]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          meta.boxClass
                        )}
                      >
                        <meta.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {n.title}
                          </span>
                          {!n.read && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                              aria-label="Unread"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {safeRelative(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            onClick={() => {
              setOpen(false);
              onNavigate("notifications");
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function safeRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Suspense / access fallbacks
// ---------------------------------------------------------------------------

function ViewSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="p-4 sm:p-6">
      <EmptyState
        icon={Lock}
        title="No access"
        description="You don't have permission to open this section. Contact a super administrator if you need access."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

export function AppShell({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);
  const unreadCount = useAppStore((s) => s.unreadCount);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const notifVersion = useAppStore((s) => s.notifVersion);

  const [collapsed, setCollapsed] = useState(() => {
    // lazy initializer — restores the persisted preference without an
    // extra effect pass (AppShell never renders on the server)
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // ---- unread notification count: on mount, every 30s, and on refresh signal
  const refreshUnread = useCallback(async () => {
    try {
      const res = await apiGet<{ count: number }>("/api/notifications/unread-count");
      setUnreadCount(typeof res?.count === "number" ? res.count : 0);
    } catch {
      /* backend may be transiently unavailable — keep last known count */
    }
  }, [setUnreadCount]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, notifVersion]);

  useEffect(() => {
    const id = setInterval(() => void refreshUnread(), 30_000);
    return () => clearInterval(id);
  }, [refreshUnread]);

  const handleNavigate = useCallback(
    (target: AppView) => {
      navigate(target);
      setMobileOpen(false);
    },
    [navigate]
  );

  const canView =
    user.role === "super_admin" || user.permissions?.[view] === true;

  const ActiveView = Views[view];
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-background">
      {/* sonner Toaster — the layout currently mounts the radix toaster only,
          so sonner toasts need this mount to be visible anywhere in the app. */}
      <Toaster position="top-right" richColors closeButton />

      {/* ---------------- desktop sidebar (fixed rail) ---------------- */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-100 transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-60"
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <SidebarNav
          view={view}
          user={user}
          collapsed={collapsed}
          unreadCount={unreadCount}
          onNavigate={handleNavigate}
        />
        <div className="shrink-0 border-t border-zinc-800 p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-200"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" />
                <span className="text-xs font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ---------------- mobile drawer ---------------- */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 gap-0 border-r-0 bg-zinc-900 p-0 text-zinc-100 [&>button:last-child]:text-zinc-400 hover:[&>button:last-child]:text-zinc-100"
        >
          <SheetTitle asChild>
            <div>
              <SidebarBrand collapsed={false} />
            </div>
          </SheetTitle>
          <SidebarNav
            view={view}
            user={user}
            collapsed={false}
            unreadCount={unreadCount}
            onNavigate={handleNavigate}
          />
          <div className="shrink-0 border-t border-zinc-800 p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 border border-zinc-700">
                <AvatarFallback className="bg-emerald-500/10 text-xs font-bold text-emerald-400">
                  {initialsOf(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {user.fullName}
                </p>
                <p className="truncate text-xs text-zinc-400">{user.email}</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------------- content column ---------------- */}
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-14" : "lg:pl-60"
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center gap-1.5 border-b bg-background/85 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 lg:hidden"
            aria-label="Open navigation menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:block">
              ASM Manpower Solutions
            </p>
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">
              {VIEW_TITLES[view] ?? "Dashboard"}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <NotificationsBell onNavigate={handleNavigate} />
            <ThemeToggle />
            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </header>

        <main className="flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Suspense fallback={<ViewSkeleton />}>
                {canView ? <ActiveView /> : <AccessDenied />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-auto border-t bg-background/60 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex flex-col items-center justify-between gap-1.5 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-muted-foreground">
              © {year} ASM Manpower Solutions — Manpower Management System
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              Powered by ASM Platform
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default AppShell;
