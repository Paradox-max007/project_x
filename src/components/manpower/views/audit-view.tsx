"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  ScrollText,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import {
  DataPagination,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from "@/components/manpower/shared/page-kit";
import type { AuditLogRecord } from "@/types/manpower";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const AUDIT_ENTITIES: { key: string; label: string }[] = [
  { key: "employee", label: "Employee" },
  { key: "site", label: "Site" },
  { key: "attendance", label: "Attendance" },
  { key: "leave_request", label: "Leave Request" },
  { key: "warning", label: "Warning" },
  { key: "fine", label: "Fine" },
  { key: "cancellation_request", label: "Cancellation Request" },
  { key: "uniform_issue", label: "Uniform Issue" },
  { key: "admin_user", label: "Administrator" },
  { key: "settings", label: "Settings" },
  { key: "auth", label: "Auth" },
  { key: "notification", label: "Notification" },
];

type Paged<T> = { data: T[]; total: number; page: number; pageSize: number };

function safeDate(value: string): Date | null {
  try {
    const d = parseISO(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function fmtDateTime(value: string): string {
  const d = safeDate(value);
  return d ? format(d, "d MMM yyyy, HH:mm") : "—";
}

/** "employee.assign_site" → "Employee · Assign site" */
function prettifyAction(action: string): string {
  const parts = action.split(".");
  const scope = parts[0] ?? action;
  const detail = parts.slice(1).join(".");
  const humanize = (s: string) =>
    s
      .replace(/_/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const scopeLabel = humanize(scope);
  if (!detail) return scopeLabel;
  return `${scopeLabel} · ${humanize(detail)}`;
}

function prettyJson(raw: string | null): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function entityLabel(entity: string): string {
  return (
    AUDIT_ENTITIES.find((e) => e.key === entity)?.label ??
    entity.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function JsonBlock({ title, raw, tone }: { title: string; raw: string | null; tone: "before" | "after" }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        tone === "before"
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
          : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
      )}
    >
      <div
        className={cn(
          "border-b px-3 py-1.5 text-xs font-semibold",
          tone === "before"
            ? "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
            : "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
        )}
      >
        {title}
      </div>
      <pre className="max-h-60 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
        {prettyJson(raw)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function AuditView() {
  const user = useAppStore((s) => s.user);
  const isSuper = user?.role === "super_admin";

  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AuditLogRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [query, entity]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (entity !== "all") params.set("entity", entity);
      if (query) params.set("query", query);
      const res = await apiGet<Paged<AuditLogRecord>>(
        `/api/audit-logs?${params.toString()}`
      );
      setData(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load audit logs";
      if (!isSuper || /permission|forbidden|super/i.test(msg)) {
        setLocked(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [page, entity, query, isSuper]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows = data?.data ?? [];
  const hasFilters = query !== "" || entity !== "all";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:p-6"
    >
      <PageHeader
        icon={ScrollText}
        title="Audit Logs"
        description="Complete history of who did what, when."
      />

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search actor or action…"
            className="pl-8 pr-8"
          />
          {queryInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQueryInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger size="sm" className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {AUDIT_ENTITIES.map((e) => (
              <SelectItem key={e.key} value={e.key}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {locked ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 py-16 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60">
            <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="font-medium">Super admin only</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Only the Super Admin can review the audit trail.
          </p>
        </div>
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : data === null ? (
        <TableSkeleton rows={6} cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          description={
            hasFilters
              ? "Nothing matches the current filters."
              : "System actions will appear here as they happen."
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQueryInput("");
                  setEntity("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
          {/* Desktop table */}
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-8 pr-0" />
                  <TableHead className="pl-2">Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="pr-4">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isOpen = expanded.has(r.id);
                  const hasPayload = r.before !== null || r.after !== null;
                  return (
                    <Fragment key={r.id}>
                      <TableRow>
                        <TableCell className="pr-0 pl-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={!hasPayload}
                            onClick={() => toggleExpanded(r.id)}
                            aria-label={isOpen ? "Collapse details" : "Expand details"}
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="pl-2 text-sm">
                          <span title={r.createdAt}>{fmtDateTime(r.createdAt)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <EmployeeAvatar
                              name={r.actorName}
                              className="h-7 w-7 text-[10px]"
                            />
                            <span className="max-w-[160px] truncate text-sm font-medium">
                              {r.actorName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md border bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-medium">
                            {prettifyAction(r.action)}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full border border-transparent bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {entityLabel(r.entity)}
                            </span>
                            {r.entityId && (
                              <span
                                title={r.entityId}
                                className="max-w-[110px] truncate font-mono text-[11px] text-muted-foreground"
                              >
                                {r.entityId}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="bg-muted/30 p-4">
                            {hasPayload ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                <JsonBlock title="Before" raw={r.before} tone="before" />
                                <JsonBlock title="After" raw={r.after} tone="after" />
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No change details were recorded for this action.
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => {
              const isOpen = expanded.has(r.id);
              const hasPayload = r.before !== null || r.after !== null;
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <EmployeeAvatar name={r.actorName} className="h-8 w-8 text-[10px]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.actorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateTime(r.createdAt)}
                        </p>
                      </div>
                    </div>
                    {hasPayload && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => toggleExpanded(r.id)}
                      >
                        {isOpen ? "Hide" : "Details"}
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md border bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-medium">
                      {prettifyAction(r.action)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-transparent bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {entityLabel(r.entity)}
                    </span>
                    {r.entityId && (
                      <span
                        title={r.entityId}
                        className="max-w-[120px] truncate font-mono text-[11px] text-muted-foreground"
                      >
                        {r.entityId}
                      </span>
                    )}
                  </div>
                  {isOpen && hasPayload && (
                    <div className="mt-3 grid gap-3">
                      <JsonBlock title="Before" raw={r.before} tone="before" />
                      <JsonBlock title="After" raw={r.after} tone="after" />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <DataPagination
            page={data.page ?? page}
            pageSize={PAGE_SIZE}
            total={data.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      )}
    </motion.div>
  );
}

export default AuditView;
