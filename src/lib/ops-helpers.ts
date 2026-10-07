import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, superAdminIds, permittedAdminIds } from "@/lib/api-helpers";
import type { MenuKey } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Shared runtime enums (zod validation + canonical ordering for summaries)
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "no_site",
  "overtime",
  "not_marked",
  "leave",
  "holiday",
] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];

export const LEAVE_TYPES = [
  "casual",
  "sick",
  "annual",
  "emergency",
  "marriage",
  "other",
] as const;

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

export const CANCELLATION_STATUSES = ["pending", "approved", "rejected"] as const;

// ---------------------------------------------------------------------------
// System settings (single-source helper for operations routes)
// ---------------------------------------------------------------------------

export type OpsSettings = {
  companyName: string;
  currency: string;
  warningRatingPenalty: number;
  fineRatingPenalty: number;
  uniformRenewalMonths: number;
  warningAbsenceThreshold: number;
};

const SETTING_DEFAULTS: Record<string, string> = {
  companyName: "ASM Manpower Solutions",
  currency: "SAR",
  warningRatingPenalty: "0.5",
  fineRatingPenalty: "1",
  uniformRenewalMonths: "6",
  warningAbsenceThreshold: "3",
};

/** Fetch SystemSetting rows into a typed map with sensible defaults. */
export async function getSettings(): Promise<OpsSettings> {
  const rows = await db.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string): number => {
    const parsed = Number(map.get(key) ?? SETTING_DEFAULTS[key] ?? "0");
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : Number(SETTING_DEFAULTS[key]);
  };
  return {
    companyName: map.get("companyName") ?? SETTING_DEFAULTS.companyName,
    currency: map.get("currency") ?? SETTING_DEFAULTS.currency,
    warningRatingPenalty: num("warningRatingPenalty"),
    fineRatingPenalty: num("fineRatingPenalty"),
    uniformRenewalMonths: Math.max(1, Math.round(num("uniformRenewalMonths"))),
    warningAbsenceThreshold: Math.max(1, Math.round(num("warningAbsenceThreshold"))),
  };
}

// ---------------------------------------------------------------------------
// Date helpers — calendar days are stored as UTC midnight
// ---------------------------------------------------------------------------

export const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Strict YYYY-MM-DD validation (rejects 2026-02-30 etc.). */
export function isYmd(value: string): boolean {
  if (!YMD_REGEX.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Parse YYYY-MM-DD into a UTC-midnight Date (or null when invalid). */
export function ymdToDate(value: string): Date | null {
  return isYmd(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** Format a Date as YYYY-MM-DD using UTC parts. */
export function dateToYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

/** UTC midnight of the current day. */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Current month as YYYY-MM (UTC). */
export function currentMonthStr(): string {
  return dateToYmd(new Date()).slice(0, 7);
}

/** Month boundaries for a YYYY-MM string: [start, end) plus days in month. */
export function monthRange(
  month: string
): { start: Date; end: Date; daysInMonth: number } | null {
  if (!MONTH_REGEX.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end, daysInMonth };
}

// ---------------------------------------------------------------------------
// Zod helpers
// ---------------------------------------------------------------------------

export const zYmd = z
  .string()
  .refine(isYmd, "Invalid date (expected YYYY-MM-DD)");

export const zMonth = z
  .string()
  .refine((v) => MONTH_REGEX.test(v), "Invalid month (expected YYYY-MM)");

// ---------------------------------------------------------------------------
// Pagination (all list endpoints)
// ---------------------------------------------------------------------------

export function paginationOf(
  url: URL,
  defaultPageSize = 10
): { page: number; pageSize: number; skip: number; take: number } {
  const pageRaw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const sizeRaw = Number.parseInt(
    url.searchParams.get("pageSize") ?? String(defaultPageSize),
    10
  );
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(100, Math.max(1, sizeRaw))
    : defaultPageSize;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// ---------------------------------------------------------------------------
// Request body parsing with zod
// ---------------------------------------------------------------------------

export type ParseResult<S extends z.ZodType> =
  | { data: z.infer<S>; error: null }
  | { data: null; error: NextResponse };

export async function parseWith<S extends z.ZodType>(
  req: NextRequest,
  schema: S
): Promise<ParseResult<S>> {
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    return { data: null, error: fail("Invalid JSON body", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request body";
    return { data: null, error: fail(message, 400) };
  }
  return { data: parsed.data as z.infer<S>, error: null };
}

// ---------------------------------------------------------------------------
// Error guard for route handlers
// ---------------------------------------------------------------------------

export async function routeGuard(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    console.error("[api] unhandled error:", error);
    return fail("Internal server error", 500);
  }
}

// ---------------------------------------------------------------------------
// Notification audience — super admins + permission holders, minus the actor
// ---------------------------------------------------------------------------

export async function reviewAudience(
  menuKey: MenuKey,
  excludeUserId: string
): Promise<string[]> {
  const ids = [...(await superAdminIds()), ...(await permittedAdminIds(menuKey))];
  return [...new Set(ids)].filter((id) => id !== excludeUserId && Boolean(id));
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Round to 2 decimals to keep rating arithmetic clean in storage. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
