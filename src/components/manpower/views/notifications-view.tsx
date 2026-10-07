"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { motion } from "framer-motion";
import {
  Bell,
  BellOff,
  CheckCheck,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/manpower/shared/page-kit";
import { notifMeta, notifTargetView } from "@/components/manpower/notif-meta";
import { apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { NotificationRecord } from "@/types/manpower";

type Filter = "all" | "unread";

function safeRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function safeFullDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm");
  } catch {
    return "";
  }
}

export function NotificationsView() {
  const navigate = useAppStore((s) => s.navigate);
  const bumpNotifVersion = useAppStore((s) => s.bumpNotifVersion);

  const [items, setItems] = useState<NotificationRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<NotificationRecord[]>("/api/notifications");
      setItems(Array.isArray(data) ? data.slice(0, 50) : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = useMemo(
    () => (items ?? []).filter((n) => !n.read).length,
    [items]
  );

  const filtered = useMemo(
    () =>
      filter === "unread" ? (items ?? []).filter((n) => !n.read) : items ?? [],
    [items, filter]
  );

  const openNotification = async (n: NotificationRecord) => {
    // optimistically mark as read locally
    if (!n.read) {
      setItems((prev) =>
        (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      bumpNotifVersion();
      try {
        await apiPost(`/api/notifications/${n.id}/read`);
      } catch {
        /* keep optimistic state; bell count already refreshed */
      }
    }
    navigate(notifTargetView(n.referenceType));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiPost("/api/notifications/read-all");
      setItems((prev) => (prev ?? []).map((n) => ({ ...n, read: true })));
      bumpNotifVersion();
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not mark notifications as read."
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const refresh = () => {
    if (!loading) void load();
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Notifications"
        description="Alerts and review requests across the system"
        icon={Bell}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="min-h-9"
              aria-label="Refresh notifications"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={markAllRead}
              disabled={markingAll || unreadCount === 0}
              className="min-h-9"
            >
              {markingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Mark all read
            </Button>
          </div>
        }
      />

      {/* filter tabs */}
      <div className="flex items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-none">
            <TabsTrigger value="all" className="min-h-9 gap-1.5 sm:px-5">
              All
              {items && items.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread" className="min-h-9 gap-1.5 sm:px-5">
              Unread
              {unreadCount > 0 && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* content */}
      {loading && items === null ? (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : error && items === null ? (
        <ErrorState message={error} retry={load} />
      ) : filtered.length === 0 ? (
        items && items.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="You're all caught up"
            description="New alerts will appear here as events happen across the system."
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="No unread notifications"
            description="Everything has been read. Switch to the All tab to review older alerts."
          />
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {filtered.map((n, index) => {
                const meta = notifMeta(n.type);
                return (
                  <motion.li
                    key={n.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.18,
                      delay: Math.min(index * 0.02, 0.2),
                      ease: "easeOut",
                    }}
                    className={cn(!n.read && "bg-emerald-500/[0.05]")}
                  >
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      title={safeFullDate(n.createdAt)}
                      className="flex min-h-11 w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          meta.boxClass
                        )}
                      >
                        <meta.icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm",
                              n.read
                                ? "font-medium text-foreground/85"
                                : "font-semibold"
                            )}
                          >
                            {n.title}
                          </span>
                          {!n.read && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                              aria-label="Unread"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {safeRelative(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default NotificationsView;
