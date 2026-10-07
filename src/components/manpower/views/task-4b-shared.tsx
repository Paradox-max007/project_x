"use client";

/**
 * Task 4-b shared widgets & hooks — used ONLY by:
 *   attendance-view, leave-view, cancellations-view, warnings-view, fines-view
 * (Owned by frontend-styling-expert / Task 4-b. Do not edit from other tasks.)
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Check, ChevronsUpDown, Loader2, RotateCcw } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, SystemSettings } from "@/types/manpower";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

export type Paged<T> = { data: T[]; total: number; page: number; pageSize: number };

export type EmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  position: string;
  siteId: string | null;
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Debounce a fast-changing value (search inputs). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Ticking clock (Date.now()) — keeps relative times & 5-min undo windows fresh. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

/** True while a record is still inside its 5-minute creator-undo window. */
export function withinUndoWindow(createdAt: string, now: number): boolean {
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && now - t < UNDO_WINDOW_MS && t <= now + 60000;
}

/** Fetch system settings once (silent fallback — views use sane defaults). */
export function useSystemSettings() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const load = useCallback(() => {
    apiGet<SystemSettings>("/api/settings")
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return settings;
}

// ---------------------------------------------------------------------------
// Date formatting helpers
// ---------------------------------------------------------------------------

function toDate(iso: string): Date {
  try {
    return parseISO(iso.length === 10 ? `${iso}T00:00:00` : iso);
  } catch {
    return new Date(iso);
  }
}

/** "5 Mar 2025" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = toDate(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "d MMM yyyy");
}

/** "5 Mar – 9 Mar 2025" (same year) or "28 Dec 2024 – 3 Jan 2025" */
export function fmtRange(start: string, end: string): string {
  const s = toDate(start);
  const e = toDate(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  return s.getFullYear() === e.getFullYear()
    ? `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`
    : `${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`;
}

/** "3 days ago" / "in 2 hours" */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(toDate(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function inclusiveDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = toDate(start).getTime();
  const e = toDate(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.round((e - s) / 86400000) + 1;
}

// ---------------------------------------------------------------------------
// Attendance summary normalisation (backend may ship array or object form)
// ---------------------------------------------------------------------------

export type AttendanceCounts = Record<AttendanceStatus, number>;

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "no_site",
  "overtime",
  "leave",
  "holiday",
  "not_marked",
];

export function emptyCounts(): AttendanceCounts {
  return {
    present: 0,
    absent: 0,
    no_site: 0,
    overtime: 0,
    leave: 0,
    holiday: 0,
    not_marked: 0,
  };
}

export function summaryToCounts(summary: unknown): AttendanceCounts {
  const counts = emptyCounts();
  if (Array.isArray(summary)) {
    for (const item of summary as { status?: string; count?: number }[]) {
      if (item && typeof item.status === "string" && item.status in counts) {
        counts[item.status as AttendanceStatus] = Number(item.count) || 0;
      }
    }
  } else if (summary && typeof summary === "object") {
    for (const [k, v] of Object.entries(summary as Record<string, unknown>)) {
      if (k in counts) counts[k as AttendanceStatus] = Number(v) || 0;
    }
  }
  return counts;
}

export function summaryOvertimeHours(summary: unknown): number {
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const v = (summary as Record<string, unknown>).overtimeHours;
    if (typeof v === "number") return v;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Money helper
// ---------------------------------------------------------------------------

export function formatMoney(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const num = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${num}`;
}

// ---------------------------------------------------------------------------
// Searchable employee picker (Popover + Command over /api/employees/select)
// ---------------------------------------------------------------------------

export function EmployeePicker({
  value,
  onChange,
  placeholder = "Select employee…",
  className,
}: {
  value: EmployeeOption | null;
  onChange: (employee: EmployeeOption | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<EmployeeOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setError(null);
    apiGet<EmployeeOption[]>("/api/employees/select")
      .then((rows) => setOptions(Array.isArray(rows) ? rows : []))
      .catch((e) => setError((e as Error).message));
  }, []);

  // initial fetch — setState only from the async callbacks (no cascading render)
  useEffect(() => {
    let alive = true;
    apiGet<EmployeeOption[]>("/api/employees/select")
      .then((rows) => {
        if (alive) setOptions(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = options ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 60);
    return list
      .filter((o) =>
        `${o.fullName} ${o.employeeCode} ${o.position}`.toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between font-normal", className)}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <EmployeeAvatar name={value.fullName} className="h-5 w-5 text-[9px]" />
              <span className="truncate">{value.fullName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {value.employeeCode}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search name, code, position…"
          />
          <CommandList>
            {error ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={load}>
                  <RotateCcw className="size-3.5" /> Retry
                </Button>
              </div>
            ) : options === null ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading employees…
              </div>
            ) : filtered.length === 0 ? (
              <CommandEmpty>No employees found.</CommandEmpty>
            ) : (
              <div className="p-1">
                {filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onChange(o);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      value?.id === o.id && "bg-accent/60"
                    )}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value?.id === o.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <EmployeeAvatar name={o.fullName} className="h-6 w-6 text-[9px]" />
                    <span className="min-w-0 flex-1 truncate">{o.fullName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {o.employeeCode}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Sticky toolbar wrapper (keeps filters visible while scrolling long tables)
// ---------------------------------------------------------------------------

export function StickyToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-16 z-20 -mx-4 mt-0 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
      {children}
    </div>
  );
}

/** Simple virtual anchor ref for the attendance cell editor popover. */
export function useVirtualAnchor() {
  const ref = useRef<HTMLDivElement | null>(null);
  const setRect = useCallback((rect: DOMRect | null) => {
    const el = ref.current;
    if (!el || !rect) return;
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }, []);
  return { ref, setRect };
}
