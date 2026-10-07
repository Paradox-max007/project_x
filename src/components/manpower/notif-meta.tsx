"use client";

import {
  AlertTriangle,
  CalendarOff,
  Info,
  Receipt,
  Shirt,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { AppView } from "@/types/manpower";

/**
 * Shared notification presentation meta — used by the AppShell bell dropdown
 * and the Notifications view (owned by Task 3).
 */

export type NotifTypeMeta = {
  icon: LucideIcon;
  boxClass: string;
};

export const NOTIF_TYPE_META: Record<string, NotifTypeMeta> = {
  leave_request: {
    icon: CalendarOff,
    boxClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  cancellation_request: {
    icon: UserX,
    boxClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  warning: {
    icon: AlertTriangle,
    boxClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  fine: {
    icon: Receipt,
    boxClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  uniform_renewal: {
    icon: Shirt,
    boxClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  system: {
    icon: Info,
    boxClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  },
};

export function notifMeta(type: string | null | undefined): NotifTypeMeta {
  return NOTIF_TYPE_META[type ?? ""] ?? NOTIF_TYPE_META.system;
}

/** Where a notification should deep-link to, based on its referenceType. */
export function notifTargetView(referenceType: string | null | undefined): AppView {
  switch (referenceType) {
    case "leave_request":
      return "leave_requests";
    case "cancellation_request":
      return "cancellation_requests";
    case "warning":
      return "warnings";
    case "fine":
      return "fines";
    case "uniform_renewal":
      return "uniform_registry";
    default:
      return "notifications";
  }
}
