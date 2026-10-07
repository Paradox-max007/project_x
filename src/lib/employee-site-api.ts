import "server-only";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptField, maskValue } from "@/lib/crypto";
import type {
  AttendanceSummary,
  EmployeeProfile,
  EmployeeRow,
  EmployeeSiteHistoryEntry,
  FineRecord,
  LeaveRequestRecord,
  SiteRecord,
  UniformIssueRecord,
  WarningRecord,
} from "@/types/manpower";

/**
 * Shared server-side helpers for the Employees + Sites API routes (Task 2-b).
 * Owned by Task 2-b — only imported by /api/employees/* and /api/sites/* routes.
 */

// ---------------------------------------------------------------------------
// Date / string helpers (calendar days are stored as UTC midnight)
// ---------------------------------------------------------------------------

/** Date → `YYYY-MM-DD` (UTC), null-safe. */
export function ymd(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Date → full ISO datetime string. */
export function isoDateTime(d: Date): string {
  return d.toISOString();
}

/** `YYYY-MM-DD` → UTC-midnight Date (matches Prisma calendar-day storage). */
export function dateToUtc(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Normalizes an optional string field: trims and maps "" → null. */
export function emptyToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** True when the error is a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2002"
  );
}

/** Safely reads a JSON request body; `ok: false` when the body is not JSON. */
export async function readJson(
  req: NextRequest
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

/** Formats the first zod issue as a user-facing validation message. */
export function zodErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

// ---------------------------------------------------------------------------
// Zod input schemas (single source of truth for employee/site validation)
// ---------------------------------------------------------------------------

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)")
  .refine(
    (s) => !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime()),
    "Invalid calendar date"
  );

const emailStr = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Invalid email format"
  );

const optStr = z.string().trim().nullish();

export const employeeCreateSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  nationality: z.string().trim().min(1, "Nationality is required"),
  dateOfBirth: dateStr.nullish(),
  phone: optStr,
  email: emailStr.nullish(),
  address: optStr,
  emergencyContact: optStr,
  position: z.string().trim().min(1, "Position is required"),
  joinDate: dateStr.nullish(),
  companyName: optStr,
  passportNumber: optStr,
  passportStatus: optStr,
  idNumber: optStr,
  idStatus: optStr,
  photoUrl: optStr,
  siteId: z.string().nullable().optional(),
});

/** PATCH: everything optional, but required fields must be non-empty when present. */
export const employeeUpdateSchema = employeeCreateSchema.partial();

export const employeeAssignSchema = z.object({
  siteId: z.string().nullable(),
  reason: z.string().trim().max(500, "Reason must be at most 500 characters").nullish(),
});

export const siteCreateSchema = z.object({
  name: z.string().trim().min(1, "Site name is required"),
  clientName: z.string().trim().min(1, "Client name is required"),
  projectName: z.string().trim().min(1, "Project name is required"),
  isActive: z.boolean().optional(),
  teamLeaderId: z.string().nullable().optional(),
});

export const siteUpdateSchema = siteCreateSchema.partial();

// ---------------------------------------------------------------------------
// Shared Prisma includes / payload types
// ---------------------------------------------------------------------------

export const employeeSiteInclude = {
  currentSite: { include: { teamLeader: { select: { fullName: true } } } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithSite = Prisma.EmployeeGetPayload<{
  include: typeof employeeSiteInclude;
}>;

export type SiteWithLeader = Prisma.SiteGetPayload<{
  include: { teamLeader: { select: { fullName: true } } };
}>;

export type SiteHistoryWithSite = Prisma.EmployeeSiteHistoryGetPayload<{
  include: { site: { select: { name: true } } };
}>;

export type UniformIssueWithItems = Prisma.UniformIssueGetPayload<{
  include: {
    site: { select: { name: true } };
    items: { include: { item: { select: { name: true } } } };
  };
}>;

// ---------------------------------------------------------------------------
// Mappers → shared contract types (src/types/manpower.ts)
// ---------------------------------------------------------------------------

export function toEmployeeProfile(emp: EmployeeWithSite): EmployeeProfile {
  return {
    id: emp.id,
    employeeCode: emp.employeeCode,
    fullName: emp.fullName,
    nationality: emp.nationality,
    dateOfBirth: ymd(emp.dateOfBirth),
    phone: emp.phone,
    email: emp.email,
    address: emp.address,
    emergencyContact: emp.emergencyContact,
    position: emp.position,
    joinDate: ymd(emp.joinDate),
    companyName: emp.companyName,
    passportNumberMasked: maskValue(decryptField(emp.passportNumber)),
    passportStatus: emp.passportStatus,
    idNumberMasked: maskValue(decryptField(emp.idNumber)),
    idStatus: emp.idStatus,
    photoUrl: emp.photoUrl,
    rating: emp.rating,
    status: emp.status as EmployeeProfile["status"],
    currentSiteId: emp.currentSiteId,
    currentSiteName: emp.currentSite?.name ?? null,
    teamLeaderName: emp.currentSite?.teamLeader?.fullName ?? null,
    createdAt: isoDateTime(emp.createdAt),
    updatedAt: isoDateTime(emp.updatedAt),
  };
}

export function toEmployeeRow(emp: EmployeeWithSite): EmployeeRow {
  return {
    id: emp.id,
    employeeCode: emp.employeeCode,
    fullName: emp.fullName,
    nationality: emp.nationality,
    position: emp.position,
    companyName: emp.companyName,
    rating: emp.rating,
    status: emp.status as EmployeeRow["status"],
    siteId: emp.currentSiteId,
    siteName: emp.currentSite?.name ?? null,
    teamLeaderName: emp.currentSite?.teamLeader?.fullName ?? null,
    phone: emp.phone,
    photoUrl: emp.photoUrl,
  };
}

export function toSiteRecord(
  site: SiteWithLeader,
  employeeCount: number
): SiteRecord {
  return {
    id: site.id,
    name: site.name,
    clientName: site.clientName,
    projectName: site.projectName,
    isActive: site.isActive,
    teamLeaderId: site.teamLeaderId,
    teamLeaderName: site.teamLeader?.fullName ?? null,
    employeeCount,
    createdAt: isoDateTime(site.createdAt),
  };
}

/** Loads a single site as a SiteRecord (with active-employee count). */
export async function getSiteRecord(id: string): Promise<SiteRecord | null> {
  const site = await db.site.findUnique({
    where: { id },
    include: { teamLeader: { select: { fullName: true } } },
  });
  if (!site) return null;
  const employeeCount = await db.employee.count({
    where: { currentSiteId: id, status: "active" },
  });
  return toSiteRecord(site, employeeCount);
}

export function toHistoryEntry(h: SiteHistoryWithSite): EmployeeSiteHistoryEntry {
  return {
    id: h.id,
    siteId: h.siteId,
    siteName: h.site.name,
    startDate: ymd(h.startDate) ?? h.startDate.toISOString(),
    endDate: ymd(h.endDate),
    reason: h.reason,
    createdByName: h.createdByName,
  };
}

/** Audit-safe employee snapshot — sensitive document numbers are MASKED, never raw. */
export function employeeSnapshot(emp: EmployeeWithSite) {
  return {
    employeeCode: emp.employeeCode,
    fullName: emp.fullName,
    nationality: emp.nationality,
    position: emp.position,
    phone: emp.phone,
    email: emp.email,
    companyName: emp.companyName,
    status: emp.status,
    rating: emp.rating,
    siteId: emp.currentSiteId,
    siteName: emp.currentSite?.name ?? null,
    passportNumber: maskValue(decryptField(emp.passportNumber)),
    idNumber: maskValue(decryptField(emp.idNumber)),
  };
}

export function toWarningRecord(
  w: Prisma.WarningGetPayload<Record<string, never>>,
  emp: { fullName: string; employeeCode: string }
): WarningRecord {
  let absentDates: string[] = [];
  if (w.absentDates) {
    try {
      const parsed: unknown = JSON.parse(w.absentDates);
      if (Array.isArray(parsed)) {
        absentDates = parsed.filter((d): d is string => typeof d === "string");
      }
    } catch {
      // malformed stored JSON — treat as empty
    }
  }
  return {
    id: w.id,
    employeeId: w.employeeId,
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode,
    reason: w.reason,
    isAutoGenerated: w.isAutoGenerated,
    absentDates,
    ratingPenalty: w.ratingPenalty,
    createdByName: w.createdByName,
    createdAt: isoDateTime(w.createdAt),
  };
}

export function toFineRecord(
  f: Prisma.FineGetPayload<Record<string, never>>,
  emp: { fullName: string; employeeCode: string }
): FineRecord {
  return {
    id: f.id,
    employeeId: f.employeeId,
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode,
    reason: f.reason,
    amount: f.amount,
    currency: f.currency,
    ratingPenalty: f.ratingPenalty,
    createdByName: f.createdByName,
    createdAt: isoDateTime(f.createdAt),
  };
}

export function toLeaveRequestRecord(
  l: Prisma.LeaveRequestGetPayload<Record<string, never>>,
  emp: { fullName: string; employeeCode: string }
): LeaveRequestRecord {
  return {
    id: l.id,
    employeeId: l.employeeId,
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode,
    leaveType: l.leaveType as LeaveRequestRecord["leaveType"],
    otherType: l.otherType,
    startDate: ymd(l.startDate) ?? l.startDate.toISOString(),
    endDate: ymd(l.endDate) ?? l.endDate.toISOString(),
    totalDays: l.totalDays,
    reason: l.reason,
    status: l.status as LeaveRequestRecord["status"],
    createdByName: l.createdByName,
    reviewedByName: l.reviewedByName,
    reviewedAt: l.reviewedAt ? isoDateTime(l.reviewedAt) : null,
    createdAt: isoDateTime(l.createdAt),
  };
}

export function toUniformIssueRecord(
  u: UniformIssueWithItems,
  emp: { fullName: string; employeeCode: string },
  opts: { maskDocumentNumber?: boolean } = {}
): UniformIssueRecord {
  const decrypted = decryptField(u.documentNumber);
  const documentNumber = opts.maskDocumentNumber
    ? maskValue(decrypted) ?? ""
    : decrypted ?? "";
  return {
    id: u.id,
    uniformCode: u.uniformCode,
    tokenNumber: u.tokenNumber,
    employeeId: u.employeeId,
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode,
    documentType: u.documentType,
    documentNumber,
    siteId: u.siteId,
    siteName: u.site?.name ?? null,
    teamLeaderName: u.teamLeaderName,
    isRenewal: u.isRenewal,
    previousIssueId: u.previousIssueId,
    issuedAt: ymd(u.issuedAt) ?? u.issuedAt.toISOString(),
    renewalDate: ymd(u.renewalDate) ?? u.renewalDate.toISOString(),
    createdByName: u.createdByName,
    items: u.items.map((it) => ({
      itemId: it.itemId,
      name: it.item.name,
      quantity: it.quantity,
    })),
  };
}

// ---------------------------------------------------------------------------
// Attendance summary (all-time, per status)
// ---------------------------------------------------------------------------

export function buildAttendanceSummary(
  groups: { status: string; count: number; overtimeHours: number | null }[]
): AttendanceSummary {
  const summary: AttendanceSummary = {
    present: 0,
    absent: 0,
    leave: 0,
    overtime: 0,
    overtimeHours: 0,
    noSite: 0,
    notMarked: 0,
    totalMarked: 0,
  };
  for (const g of groups) {
    summary.totalMarked += g.count;
    summary.overtimeHours += g.overtimeHours ?? 0;
    if (g.status === "present") summary.present = g.count;
    else if (g.status === "absent") summary.absent = g.count;
    else if (g.status === "leave") summary.leave = g.count;
    else if (g.status === "overtime") summary.overtime = g.count;
    else if (g.status === "no_site") summary.noSite = g.count;
    else if (g.status === "not_marked") summary.notMarked = g.count;
    // "holiday" rows count toward totalMarked only (not broken out in the type)
  }
  summary.overtimeHours = Math.round(summary.overtimeHours * 100) / 100;
  return summary;
}

// ---------------------------------------------------------------------------
// Employee code generation — `<prefix>-<year>-<NNN>`, never reused
// ---------------------------------------------------------------------------

export async function generateEmployeeCode(): Promise<string> {
  const setting = await db.systemSetting.findUnique({
    where: { key: "employeeIdPrefix" },
  });
  const prefix = (setting?.value ?? "").trim() || "ASM";
  const year = new Date().getUTCFullYear();
  // Scan ALL existing codes (any prefix/year, incl. soft-deleted employees)
  // and take the max numeric suffix — codes are never reused.
  const rows = await db.employee.findMany({ select: { employeeCode: true } });
  let max = 0;
  for (const row of rows) {
    const m = row.employeeCode.match(/^(.*)-(\d{4})-(\d+)$/);
    if (m) {
      const n = Number.parseInt(m[3], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Site assignment (shared by POST create / PATCH / assign endpoints)
// ---------------------------------------------------------------------------

export type AssignOutcome =
  | {
      ok: true;
      changed: boolean;
      employeeCode: string;
      previousSiteName: string | null;
      newSiteName: string | null;
    }
  | { ok: false; status: number; message: string };

/**
 * Moves an employee to a site (or to the idle pool when siteId is null).
 * - closes any open EmployeeSiteHistory row (endDate = now)
 * - creates the new history row when target site is non-null
 * - updates currentSiteId
 * - clears team leadership the employee holds on any OTHER site
 */
export async function assignEmployeeToSite(
  client: Prisma.TransactionClient,
  params: {
    employeeId: string;
    siteId: string | null;
    reason?: string | null;
    createdByName: string;
  }
): Promise<AssignOutcome> {
  const employee = await client.employee.findUnique({
    where: { id: params.employeeId },
    include: {
      currentSite: { select: { id: true, name: true } },
      leaderOfSite: { select: { id: true, name: true } },
    },
  });
  if (!employee) {
    return { ok: false, status: 404, message: "Employee not found" };
  }
  if (employee.status === "deleted") {
    return {
      ok: false,
      status: 400,
      message: "Cannot assign a deleted employee to a site",
    };
  }

  let newSite: { id: string; name: string } | null = null;
  if (params.siteId) {
    const site = await client.site.findUnique({
      where: { id: params.siteId },
      select: { id: true, name: true, isActive: true },
    });
    if (!site) return { ok: false, status: 404, message: "Site not found" };
    if (!site.isActive) {
      return { ok: false, status: 400, message: "Site is not active" };
    }
    newSite = site;
  }

  const currentSiteId = employee.currentSiteId ?? null;
  const targetSiteId = params.siteId ?? null;
  if (currentSiteId === targetSiteId) {
    return {
      ok: true,
      changed: false,
      employeeCode: employee.employeeCode,
      previousSiteName: employee.currentSite?.name ?? null,
      newSiteName: employee.currentSite?.name ?? null,
    };
  }

  const now = new Date();
  await client.employeeSiteHistory.updateMany({
    where: { employeeId: employee.id, endDate: null },
    data: { endDate: now },
  });
  if (newSite) {
    await client.employeeSiteHistory.create({
      data: {
        employeeId: employee.id,
        siteId: newSite.id,
        startDate: now,
        reason: params.reason?.trim() || null,
        createdByName: params.createdByName,
      },
    });
  }
  await client.employee.update({
    where: { id: employee.id },
    data: { currentSiteId: newSite ? newSite.id : null },
  });
  if (employee.leaderOfSite && employee.leaderOfSite.id !== newSite?.id) {
    await client.site.update({
      where: { id: employee.leaderOfSite.id },
      data: { teamLeaderId: null },
    });
  }

  return {
    ok: true,
    changed: true,
    employeeCode: employee.employeeCode,
    previousSiteName: employee.currentSite?.name ?? null,
    newSiteName: newSite?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Site deactivation cascade (shared by PATCH + /deactivate endpoint)
// ---------------------------------------------------------------------------

/**
 * Deactivates a site: closes open site histories (reason "Site deactivated"),
 * unassigns its employees (back to idle pool) and clears team leadership.
 * Historical attendance + site history rows are preserved. Returns the number
 * of employees that were unassigned.
 */
export async function deactivateSiteCascade(
  client: Prisma.TransactionClient,
  siteId: string
): Promise<number> {
  const now = new Date();
  await client.employeeSiteHistory.updateMany({
    where: { siteId, endDate: null },
    data: { endDate: now, reason: "Site deactivated" },
  });
  const unassigned = await client.employee.updateMany({
    where: { currentSiteId: siteId },
    data: { currentSiteId: null },
  });
  await client.site.update({
    where: { id: siteId },
    data: { isActive: false, teamLeaderId: null },
  });
  return unassigned.count;
}
