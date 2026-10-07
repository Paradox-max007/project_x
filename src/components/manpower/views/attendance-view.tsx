"use client";

/**
 * AttendanceView — Task 4-b (spec §17–22)
 * List (monthly matrix) + Calendar (single employee) modes,
 * cell status editor popover, bulk day marking, summary chips.
 */

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import {
  addDays,
  addMonths,
  eachWeekOfInterval,
  endOfMonth,
  format,
  getDaysInMonth,
  getDate,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Rows3,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type {
  AttendanceBulkInput,
  AttendanceMonthResponse,
  AttendanceRow,
  AttendanceStatus,
  DayStatus,
  SiteRecord,
} from "@/types/manpower";
import {
  ATTENDANCE_STATUS_META,
  AttendanceBadge,
} from "@/components/manpower/shared/status-badges";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import {
  DataPagination,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/manpower/shared/page-kit";
import {
  ATTENDANCE_STATUSES,
  emptyCounts,
  fmtDate,
  summaryToCounts,
  useDebounced,
  useVirtualAnchor,
  EmployeePicker,
  StickyToolbar,
  type EmployeeOption,
} from "@/components/manpower/views/task-4b-shared";

const PAGE_SIZE = 15;
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type ViewMode = "list" | "calendar";

type EditorTarget = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  day: number;
  date: string; // YYYY-MM-DD
  current: DayStatus | null;
};

type VirtualElement = { getBoundingClientRect: () => DOMRect };

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SummaryChip({ status, value }: { status: AttendanceStatus; value: number }) {
  const meta = ATTENDANCE_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.className
      )}
    >
      {meta.label}
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

function LegendChip({ status }: { status: AttendanceStatus }) {
  const meta = ATTENDANCE_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.className
      )}
    >
      <span className="font-bold">{meta.short}</span>
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cell status editor (shared by List + Calendar modes)
// ---------------------------------------------------------------------------

function StatusEditor({
  target,
  onClose,
  onSave,
}: {
  target: EditorTarget;
  onClose: () => void;
  onSave: (ds: DayStatus) => Promise<void>;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(
    target.current && target.current.status !== "not_marked"
      ? target.current.status
      : "present"
  );
  const [ot, setOt] = useState(
    target.current?.overtimeHours != null ? String(target.current.overtimeHours) : ""
  );
  const [notes, setNotes] = useState(target.current?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        status,
        overtimeHours: status === "overtime" ? Math.max(0, Number(ot) || 0) : null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch {
      // error already toasted + state reverted by the caller
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-2 border-b pb-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{target.employeeName}</p>
          <p className="text-xs text-muted-foreground">
            {target.employeeCode} · {fmtDate(target.date)}
          </p>
        </div>
        <AttendanceBadge status={status} />
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-2.5">
        {ATTENDANCE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors",
              status === s
                ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                : "hover:bg-accent"
            )}
          >
            <AttendanceBadge status={s} />
            <span className="truncate">{ATTENDANCE_STATUS_META[s].label}</span>
          </button>
        ))}
      </div>

      {status === "overtime" && (
        <div className="pt-2.5">
          <Label className="text-xs">Overtime hours</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={ot}
            onChange={(e) => setOt(e.target.value)}
            placeholder="e.g. 2"
            className="h-8"
          />
        </div>
      )}

      <div className="pt-2.5">
        <Label className="text-xs">Note (optional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note…"
          className="h-8"
        />
      </div>

      <div className="flex justify-end gap-2 pt-3">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk "mark a day" dialog
// ---------------------------------------------------------------------------

function BulkMarkDialog({
  open,
  onOpenChange,
  month,
  rows,
  siteId,
  sites,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: Date;
  rows: AttendanceRow[];
  siteId: string; // "all" | "idle" | site id
  sites: SiteRecord[] | null;
  onDone: () => void;
}) {
  const monthStr = format(month, "yyyy-MM");
  const dim = getDaysInMonth(month);
  const defaultDate = isSameMonth(month, new Date())
    ? format(new Date(), "yyyy-MM-dd")
    : `${monthStr}-01`;

  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [ot, setOt] = useState("2");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setStatus("present");
      setOt("2");
      setBusy(false);
    }
  }, [open, defaultDate]);

  const site = siteId !== "all" && siteId !== "idle" ? sites?.find((s) => s.id === siteId) ?? null : null;
  const targetIds =
    site == null
      ? siteId === "idle"
        ? rows.filter((r) => !r.siteId).map((r) => r.employeeId)
        : rows.map((r) => r.employeeId)
      : null;
  const scopeCount = targetIds ? targetIds.length : null;

  const submit = async () => {
    if (!date) {
      toast.error("Pick a date first");
      return;
    }
    if (date < `${monthStr}-01` || date > `${monthStr}-${dim}`) {
      toast.error("The date must be within the selected month");
      return;
    }
    if (!site && (scopeCount ?? 0) === 0) {
      toast.error("No employees in the current scope");
      return;
    }
    setBusy(true);
    try {
      const body: AttendanceBulkInput = {
        date,
        status,
        overtimeHours: status === "overtime" ? Math.max(0, Number(ot) || 0) : null,
      };
      if (site) body.siteId = site.id;
      else if (targetIds) body.employeeIds = targetIds;
      const r = await apiPost<{ updated: number }>("/api/attendance/bulk", body);
      const n = r?.updated ?? 0;
      toast.success(`Updated ${n} employee${n === 1 ? "" : "s"}`);
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const scopeText = site
    ? `All active employees assigned to ${site.name}`
    : siteId === "idle"
      ? `${scopeCount} idle employee${scopeCount === 1 ? "" : "s"} currently listed`
      : `${scopeCount} employee${scopeCount === 1 ? "" : "s"} matching the current filters (this page)`;

  return (
    <>
      <Button variant="outline" onClick={() => onOpenChange(true)}>
        <CalendarDays className="size-4" />
        Mark day…
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark a day in bulk</DialogTitle>
            <DialogDescription>
              Apply one attendance status to many employees at once.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  min={`${monthStr}-01`}
                  max={`${monthStr}-${dim}`}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ATTENDANCE_STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {status === "overtime" && (
              <div className="grid gap-1.5">
                <Label>Overtime hours</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={ot}
                  onChange={(e) => setOt(e.target.value)}
                />
              </div>
            )}

            <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Scope:</span> {scopeText}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || (!site && (scopeCount ?? 0) === 0)}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {site
                ? "Apply to site"
                : `Apply to ${scopeCount} employee${scopeCount === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function AttendanceView() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const monthStr = format(month, "yyyy-MM");
  const daysInMonth = getDaysInMonth(month);

  // filters (list mode)
  const [siteId, setSiteId] = useState<string>("all"); // "all" | "idle" | site id
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);

  // sites for the filter select
  const [sites, setSites] = useState<SiteRecord[] | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);

  // list data
  const [data, setData] = useState<AttendanceMonthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // cell editor
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const { ref: anchorRef, setRect } = useVirtualAnchor();

  // bulk dialog
  const [bulkOpen, setBulkOpen] = useState(false);

  // calendar mode
  const [calEmployee, setCalEmployee] = useState<EmployeeOption | null>(null);
  const [calData, setCalData] = useState<{ days: Record<string, DayStatus> } | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const dateForDay = useCallback(
    (day: number) => `${monthStr}-${String(day).padStart(2, "0")}`,
    [monthStr]
  );
  const isFutureDay = useCallback((day: number) => dateForDay(day) > todayStr, [dateForDay, todayStr]);
  const isTodayDay = useCallback((day: number) => dateForDay(day) === todayStr, [dateForDay, todayStr]);

  // ---- data loading ------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        month: monthStr,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (siteId !== "all") params.set("siteId", siteId);
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      const res = await apiGet<AttendanceMonthResponse>(`/api/attendance?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [monthStr, page, siteId, debouncedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSites = useCallback(() => {
    setSitesError(null);
    apiGet<SiteRecord[]>("/api/sites?includeInactive=true")
      .then((r) => setSites(Array.isArray(r) ? r : []))
      .catch((e) => setSitesError((e as Error).message));
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  const calReload = useCallback(() => {
    if (!calEmployee) return;
    setCalLoading(true);
    setCalError(null);
    apiGet<{ days?: Record<string, DayStatus> }>(
      `/api/attendance/calendar?employeeId=${encodeURIComponent(calEmployee.id)}&month=${monthStr}`
    )
      .then((r) => setCalData({ days: r?.days ?? {} }))
      .catch((e) => {
        setCalError((e as Error).message);
        setCalData(null);
      })
      .finally(() => setCalLoading(false));
  }, [calEmployee, monthStr]);

  useEffect(() => {
    if (viewMode !== "calendar" || !calEmployee) {
      setCalData(null);
      setCalError(null);
      return;
    }
    let alive = true;
    setCalLoading(true);
    setCalError(null);
    apiGet<{ days?: Record<string, DayStatus> }>(
      `/api/attendance/calendar?employeeId=${encodeURIComponent(calEmployee.id)}&month=${monthStr}`
    )
      .then((r) => {
        if (alive) setCalData({ days: r?.days ?? {} });
      })
      .catch((e) => {
        if (alive) {
          setCalError((e as Error).message);
          setCalData(null);
        }
      })
      .finally(() => {
        if (alive) setCalLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [viewMode, calEmployee, monthStr]);

  // ---- mutations ---------------------------------------------------------

  /** Optimistically upsert a day for an employee in whichever datasets contain them. */
  const applyDay = useCallback((employeeId: string, day: number, ds: DayStatus | null) => {
    const key = String(day);
    setData((prev) => {
      if (!prev) return prev;
      let oldStatus: AttendanceStatus | null = null;
      let found = false;
      const rows = prev.data.map((r) => {
        if (r.employeeId !== employeeId) return r;
        found = true;
        const old = r.days[key];
        if (old) oldStatus = old.status;
        const days = { ...r.days };
        if (ds) days[key] = ds;
        else delete days[key];
        return { ...r, days };
      });
      if (!found) return prev;
      let summary = prev.summary;
      if (ds) {
        summary = prev.summary.map((s) => {
          let count = s.count;
          if (oldStatus && s.status === oldStatus) count = Math.max(0, count - 1);
          if (s.status === ds.status) count += 1;
          return { ...s, count };
        });
      }
      return { ...prev, data: rows, summary };
    });
    setCalData((prev) => {
      if (!prev) return prev;
      const days = { ...prev.days };
      if (ds) days[key] = ds;
      else delete days[key];
      return { ...prev, days };
    });
  }, []);

  const saveDay = useCallback(
    async (target: EditorTarget, ds: DayStatus) => {
      applyDay(target.employeeId, target.day, ds); // optimistic
      try {
        await apiPatch("/api/attendance", {
          employeeId: target.employeeId,
          date: target.date,
          status: ds.status,
          overtimeHours: ds.status === "overtime" ? ds.overtimeHours : null,
          notes: ds.notes,
        });
        toast.success(
          `${target.employeeName} · ${fmtDate(target.date)} — ${ATTENDANCE_STATUS_META[ds.status].label}`
        );
      } catch (e) {
        applyDay(target.employeeId, target.day, target.current); // revert
        toast.error(`Failed to save: ${(e as Error).message}`);
        throw e;
      }
    },
    [applyDay]
  );

  // ---- editors -----------------------------------------------------------

  const openCellEditor = (
    emp: { employeeId: string; employeeCode: string; fullName: string },
    day: number,
    current: DayStatus | null,
    rect: DOMRect
  ) => {
    setRect(rect);
    setEditing({
      employeeId: emp.employeeId,
      employeeName: emp.fullName,
      employeeCode: emp.employeeCode,
      day,
      date: dateForDay(day),
      current,
    });
  };

  const viewEmployeeCalendar = (row: AttendanceRow) => {
    setCalEmployee({
      id: row.employeeId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      position: row.position,
      siteId: row.siteId,
    });
    setViewMode("calendar");
  };

  // ---- derived -----------------------------------------------------------

  const rows = data?.data ?? [];
  const counts = useMemo(() => summaryToCounts(data?.summary), [data]);
  const dayNumbers = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );
  const weekdayOf = useCallback(
    (day: number) => new Date(month.getFullYear(), month.getMonth(), day).getDay(),
    [month]
  );

  const calendarCells = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    const cells: { date: Date; day: number; inMonth: boolean }[] = [];
    for (const w of weeks) {
      for (let i = 0; i < 7; i++) {
        const d = addDays(w, i);
        cells.push({ date: d, day: getDate(d), inMonth: isSameMonth(d, month) });
      }
    }
    return cells;
  }, [month]);

  const calStats = useMemo(() => {
    const c = emptyCounts();
    let hours = 0;
    for (const v of Object.values(calData?.days ?? {})) {
      if (v?.status && v.status in c) c[v.status] += 1;
      if (v?.status === "overtime" && v.overtimeHours) hours += v.overtimeHours;
    }
    return { c, hours };
  }, [calData]);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  // ---- render ------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:space-y-6 sm:p-6"
    >
      <PageHeader
        icon={CalendarCheck}
        title="Attendance"
        description="Mark and review daily attendance per site — present, absent, leave, overtime and holidays."
        actions={
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="list">
                <Rows3 className="size-3.5" />
                List
              </TabsTrigger>
              <TabsTrigger value="calendar">
                <CalendarDays className="size-3.5" />
                Calendar
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {/* hidden anchor for the status editor popover */}
      <div ref={anchorRef} aria-hidden className="pointer-events-none fixed left-0 top-0 z-0 h-0 w-0" />

      <StickyToolbar>
        <Card className="gap-3 p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-8"
                aria-label="Previous month"
                onClick={() => {
                  setMonth(startOfMonth(addMonths(month, -1)));
                  setPage(1);
                }}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Select
                value={String(month.getMonth())}
                onValueChange={(v) => {
                  setMonth(startOfMonth(new Date(month.getFullYear(), Number(v), 1)));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[118px]" aria-label="Month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(month.getFullYear())}
                onValueChange={(v) => {
                  setMonth(startOfMonth(new Date(Number(v), month.getMonth(), 1)));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[84px]" aria-label="Year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-8"
                aria-label="Next month"
                onClick={() => {
                  setMonth(startOfMonth(addMonths(month, 1)));
                  setPage(1);
                }}
              >
                <ChevronRight className="size-4" />
              </Button>
              {!isSameMonth(month, new Date()) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMonth(startOfMonth(new Date()));
                    setPage(1);
                  }}
                >
                  Today
                </Button>
              )}
            </div>

            <Separator orientation="vertical" className="hidden h-6 sm:block" />

            {viewMode === "list" ? (
              <>
                <Select
                  value={siteId}
                  onValueChange={(v) => {
                    setSiteId(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[190px]" aria-label="Site filter">
                    <SelectValue placeholder="All sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    <SelectItem value="idle">Idle employees</SelectItem>
                    {(sites ?? [])
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="relative min-w-[150px] flex-1 sm:max-w-[260px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search employee…"
                    className="pl-8"
                  />
                </div>
                <BulkMarkDialog
                  open={bulkOpen}
                  onOpenChange={setBulkOpen}
                  month={month}
                  rows={rows}
                  siteId={siteId}
                  sites={sites}
                  onDone={() => void load()}
                />
              </>
            ) : (
              <div className="min-w-[220px] flex-1 sm:max-w-[340px]">
                <EmployeePicker
                  value={calEmployee}
                  onChange={setCalEmployee}
                  placeholder="Select employee to view calendar…"
                />
              </div>
            )}
          </div>

          {sitesError && viewMode === "list" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Site filter failed to load — {sitesError}.{" "}
              <button type="button" className="underline underline-offset-2" onClick={loadSites}>
                Retry
              </button>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
            <span className="mr-1 text-xs font-medium text-muted-foreground">Legend:</span>
            {ATTENDANCE_STATUSES.map((s) => (
              <LegendChip key={s} status={s} />
            ))}
          </div>
        </Card>
      </StickyToolbar>

      {/* ----------------------------------------------------------------- */}
      {/* LIST MODE — monthly matrix                                         */}
      {/* ----------------------------------------------------------------- */}
      {viewMode === "list" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <SummaryChip status="present" value={counts.present} />
            <SummaryChip status="absent" value={counts.absent} />
            <SummaryChip status="leave" value={counts.leave} />
            <SummaryChip status="overtime" value={counts.overtime} />
            <SummaryChip status="holiday" value={counts.holiday} />
            <SummaryChip status="no_site" value={counts.no_site} />
            <span className="ml-auto hidden text-xs text-muted-foreground lg:block">
              {format(month, "MMMM yyyy")} · click a cell to mark · future days are locked
            </span>
          </div>

          <Card className="gap-0 overflow-hidden py-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-1 overflow-hidden">
                    <Skeleton className="h-9 w-[210px] shrink-0" />
                    {Array.from({ length: 18 }).map((_, j) => (
                      <Skeleton
                        key={j}
                        className="h-9 w-10 shrink-0"
                        style={{ animationDelay: `${(i * 18 + j) * 35}ms` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-4">
                <ErrorState message={error} retry={() => void load()} />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={CalendarCheck}
                  title="No employees found"
                  description="No employees match the current month, site filter or search. Try clearing the filters."
                />
              </div>
            ) : (
              <div className="relative max-h-[70vh] overflow-auto">
                <table className="border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-40 w-[220px] min-w-[220px] border-b bg-card px-3 py-2 text-left align-middle font-medium">
                        Employee
                      </th>
                      {dayNumbers.map((d) => {
                        const weekend = weekdayOf(d) === 5 || weekdayOf(d) === 6;
                        const today = isTodayDay(d);
                        return (
                          <th
                            key={d}
                            className={cn(
                              "sticky top-0 z-30 w-10 min-w-10 border-b p-0",
                              weekend ? "bg-muted" : "bg-card",
                              today &&
                                "shadow-[inset_0_-2px_0_0_var(--primary)]"
                            )}
                            title={`${format(new Date(month.getFullYear(), month.getMonth(), d), "EEE d MMM yyyy")}`}
                          >
                            <div className="flex flex-col items-center py-1.5">
                              <span className="text-[9px] font-medium uppercase leading-none text-muted-foreground">
                                {WEEKDAY_LETTERS[weekdayOf(d)]}
                              </span>
                              <span
                                className={cn(
                                  "mt-0.5 text-xs font-semibold leading-none tabular-nums",
                                  today && "text-primary"
                                )}
                              >
                                {d}
                              </span>
                            </div>
                          </th>
                        );
                      })}
                      <th className="sticky top-0 z-30 border-b bg-card px-3 py-2 text-right font-medium">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Summary
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const dayStats = dayNumbers.map((d) => ({
                        d,
                        ds: row.days[String(d)] ?? null,
                      }));
                      const present = dayStats.filter((x) => x.ds?.status === "present").length;
                      const absent = dayStats.filter((x) => x.ds?.status === "absent").length;
                      const overtime = dayStats.filter((x) => x.ds?.status === "overtime").length;
                      const leave = dayStats.filter((x) => x.ds?.status === "leave").length;
                      return (
                        <tr key={row.employeeId} className="group/row">
                          <td className="sticky left-0 z-20 border-b bg-card px-2 py-1.5 transition-colors group-hover/row:bg-muted">
                            <div className="flex items-center gap-2">
                              <EmployeeAvatar
                                name={row.fullName}
                                className="h-8 w-8 shrink-0 text-[10px]"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-medium leading-tight">
                                  {row.fullName}
                                </p>
                                <p className="truncate text-[11px] leading-tight text-muted-foreground">
                                  {row.employeeCode}
                                  {row.siteName ? ` · ${row.siteName}` : " · Idle"}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100"
                                title={`Open ${row.fullName}'s calendar`}
                                aria-label={`Open ${row.fullName}'s calendar`}
                                onClick={() => viewEmployeeCalendar(row)}
                              >
                                <CalendarDays className="size-4" />
                              </Button>
                            </div>
                          </td>
                          {dayStats.map(({ d, ds }) => {
                            const weekend = weekdayOf(d) === 5 || weekdayOf(d) === 6;
                            const future = isFutureDay(d);
                            const today = isTodayDay(d);
                            return (
                              <td
                                key={d}
                                className={cn(
                                  "w-10 min-w-10 border-b p-0 text-center",
                                  weekend && "bg-muted/30",
                                  today && "bg-primary/5"
                                )}
                              >
                                <button
                                  type="button"
                                  disabled={future}
                                  onClick={(e) =>
                                    openCellEditor(
                                      {
                                        employeeId: row.employeeId,
                                        employeeCode: row.employeeCode,
                                        fullName: row.fullName,
                                      },
                                      d,
                                      ds,
                                      e.currentTarget.getBoundingClientRect()
                                    )
                                  }
                                  className={cn(
                                    "flex h-10 w-full items-center justify-center transition-colors",
                                    future
                                      ? "cursor-not-allowed opacity-25"
                                      : "hover:bg-accent"
                                  )}
                                  title={
                                    future
                                      ? "Future dates cannot be marked"
                                      : `${row.fullName} · ${fmtDate(dateForDay(d))}${
                                          ds ? ` — ${ATTENDANCE_STATUS_META[ds.status].label}` : " — not marked"
                                        }`
                                  }
                                >
                                  <AttendanceBadge status={ds?.status ?? "not_marked"} />
                                </button>
                              </td>
                            );
                          })}
                          <td className="border-b px-3 py-1.5 text-right whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                P {present}
                              </span>
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                A {absent}
                              </span>
                              <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                                L {leave}
                              </span>
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                OT {overtime}
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {data && data.total > 0 && (
            <DataPagination
              page={data.page || page}
              pageSize={data.pageSize || PAGE_SIZE}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* CALENDAR MODE — single employee month                               */}
      {/* ----------------------------------------------------------------- */}
      {viewMode === "calendar" && (
        <Card className="gap-4 p-4 sm:p-6">
          {!calEmployee ? (
            <EmptyState
              icon={CalendarDays}
              title="Select an employee to view their calendar"
              description="Pick an employee from the toolbar above, then click any day to mark or edit attendance."
            />
          ) : calLoading ? (
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAY_LETTERS.map((l) => (
                <Skeleton key={`h-${l}`} className="h-5 rounded" />
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-[74px] rounded-lg"
                  style={{ animationDelay: `${i * 35}ms` }}
                />
              ))}
            </div>
          ) : calError ? (
            <ErrorState message={calError} retry={calReload} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <EmployeeAvatar name={calEmployee.fullName} className="h-9 w-9" />
                  <div>
                    <p className="text-sm font-semibold leading-tight">{calEmployee.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {calEmployee.employeeCode}
                      {calEmployee.position ? ` · ${calEmployee.position}` : ""}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {format(month, "MMMM yyyy")}
                </p>
              </div>

              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {WEEKDAY_LETTERS.map((l, i) => (
                  <div
                    key={l}
                    className={cn(
                      "pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                      (i === 5 || i === 6) && "text-muted-foreground/70"
                    )}
                  >
                    {l}
                  </div>
                ))}
                {calendarCells.map((cell) => {
                  const dstr = format(cell.date, "yyyy-MM-dd");
                  const ds = calData?.days[String(cell.day)] ?? null;
                  const future = dstr > todayStr;
                  const today = dstr === todayStr;
                  const dow = cell.date.getDay();
                  const weekend = dow === 5 || dow === 6;
                  if (!cell.inMonth) {
                    return <div key={dstr} className="min-h-[64px] rounded-lg sm:min-h-[74px]" />;
                  }
                  return (
                    <button
                      key={dstr}
                      type="button"
                      disabled={future}
                      onClick={(e) =>
                        openCellEditor(
                          {
                            employeeId: calEmployee.id,
                            employeeCode: calEmployee.employeeCode,
                            fullName: calEmployee.fullName,
                          },
                          cell.day,
                          ds,
                          e.currentTarget.getBoundingClientRect()
                        )
                      }
                      title={
                        future
                          ? "Future dates cannot be marked"
                          : `${fmtDate(dstr)}${ds ? ` — ${ATTENDANCE_STATUS_META[ds.status].label}` : " — not marked"}`
                      }
                      className={cn(
                        "relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-lg border p-1 text-center transition-colors sm:min-h-[74px]",
                        weekend && "bg-muted/30",
                        future
                          ? "cursor-not-allowed opacity-35"
                          : "hover:border-primary/40 hover:bg-accent",
                        today && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                        ds && "border-transparent"
                      )}
                    >
                      <span className="absolute left-1.5 top-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                        {cell.day}
                      </span>
                      <AttendanceBadge status={ds?.status ?? "not_marked"} />
                      {ds?.status === "overtime" && ds.overtimeHours ? (
                        <span className="text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                          {ds.overtimeHours}h
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-1.5">
                <SummaryChip status="present" value={calStats.c.present} />
                <SummaryChip status="absent" value={calStats.c.absent} />
                <SummaryChip status="leave" value={calStats.c.leave} />
                <SummaryChip status="overtime" value={calStats.c.overtime} />
                <SummaryChip status="holiday" value={calStats.c.holiday} />
                {calStats.hours > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    OT hours
                    <span className="font-bold tabular-nums">{calStats.hours}</span>
                  </span>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Status editor popover (single instance, anchored to clicked cell) */}
      <Popover
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <PopoverAnchor virtualRef={anchorRef as unknown as RefObject<VirtualElement>} />
        <PopoverContent
          className="w-72 p-0"
          align="start"
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {editing && (
            <StatusEditor
              key={`${editing.employeeId}-${editing.day}`}
              target={editing}
              onClose={() => setEditing(null)}
              onSave={(ds) => saveDay(editing, ds)}
            />
          )}
        </PopoverContent>
      </Popover>
    </motion.div>
  );
}

export default AttendanceView;
