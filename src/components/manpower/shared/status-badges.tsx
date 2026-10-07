"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AttendanceStatus,
  CancellationStatus,
  EmployeeStatus,
  LeaveStatus,
} from "@/types/manpower";

type Variant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"
  | "muted";

const VARIANT_CLASS: Record<Variant, string> = {
  default: "",
  secondary: "",
  destructive: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-transparent",
  outline: "",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-transparent",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-transparent",
  info: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-transparent",
  muted: "bg-muted text-muted-foreground border-transparent",
};

function Badge2({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(VARIANT_CLASS[variant], className)}>
      {children}
    </Badge>
  );
}

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  if (status === "active")
    return <Badge2 variant="success">Active</Badge2>;
  if (status === "pending_deletion")
    return <Badge2 variant="warning">Pending Deletion</Badge2>;
  return <Badge2 variant="destructive">Deleted</Badge2>;
}

export function WorkStatusBadge({ working }: { working: boolean }) {
  return working ? (
    <Badge2 variant="info">Working</Badge2>
  ) : (
    <Badge2 variant="muted">Idle</Badge2>
  );
}

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  switch (status) {
    case "approved":
      return <Badge2 variant="success">Approved</Badge2>;
    case "rejected":
      return <Badge2 variant="destructive">Rejected</Badge2>;
    case "cancelled":
      return <Badge2 variant="muted">Cancelled</Badge2>;
    default:
      return <Badge2 variant="warning">Pending</Badge2>;
  }
}

export function CancellationStatusBadge({ status }: { status: CancellationStatus }) {
  switch (status) {
    case "approved":
      return <Badge2 variant="destructive">Approved</Badge2>;
    case "rejected":
      return <Badge2 variant="success">Rejected</Badge2>;
    default:
      return <Badge2 variant="warning">Pending</Badge2>;
  }
}

export function SiteStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge2 variant="success">Active</Badge2>
  ) : (
    <Badge2 variant="muted">Inactive</Badge2>
  );
}

export const ATTENDANCE_STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; className: string }
> = {
  present: {
    label: "Present",
    short: "P",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  },
  absent: {
    label: "Absent",
    short: "A",
    className:
      "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900",
  },
  no_site: {
    label: "No Site",
    short: "NS",
    className:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  },
  overtime: {
    label: "Overtime",
    short: "OT",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  },
  not_marked: {
    label: "Not Marked",
    short: "—",
    className:
      "bg-muted/50 text-muted-foreground/60 border-transparent",
  },
  leave: {
    label: "Leave",
    short: "L",
    className:
      "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-900",
  },
  holiday: {
    label: "Holiday",
    short: "H",
    className:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-900",
  },
};

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const meta = ATTENDANCE_STATUS_META[status];
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-[10px] font-bold",
        meta.className
      )}
    >
      {meta.short}
    </span>
  );
}

export function GenericBadge({
  children,
  variant = "muted",
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return <Badge2 variant={variant}>{children}</Badge2>;
}
