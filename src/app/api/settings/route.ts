import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, logAudit, ok, parseBody, requireUser } from "@/lib/api-helpers";
import type { SystemSettings } from "@/types/manpower";

const DEFAULT_SETTINGS: SystemSettings = {
  companyName: "ASM Manpower Solutions",
  companyLogo: "",
  companyAddress: "",
  companyPhone: "",
  currency: "SAR",
  timezone: "Asia/Riyadh",
  employeeIdPrefix: "ASM",
  warningRatingPenalty: 0.5,
  fineRatingPenalty: 1,
  uniformRenewalMonths: 6,
  warningAbsenceThreshold: 3,
};

/** Numeric settings are stored as strings in the key/value table. */
function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadSettings(): Promise<SystemSettings> {
  const rows = await db.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const str = (key: string, fallback: string) =>
    map.has(key) ? (map.get(key) as string) : fallback;
  return {
    companyName: str("companyName", DEFAULT_SETTINGS.companyName),
    companyLogo: str("companyLogo", DEFAULT_SETTINGS.companyLogo),
    companyAddress: str("companyAddress", DEFAULT_SETTINGS.companyAddress),
    companyPhone: str("companyPhone", DEFAULT_SETTINGS.companyPhone),
    currency: str("currency", DEFAULT_SETTINGS.currency),
    timezone: str("timezone", DEFAULT_SETTINGS.timezone),
    employeeIdPrefix: str("employeeIdPrefix", DEFAULT_SETTINGS.employeeIdPrefix),
    warningRatingPenalty: parseNumber(
      map.get("warningRatingPenalty"),
      DEFAULT_SETTINGS.warningRatingPenalty
    ),
    fineRatingPenalty: parseNumber(
      map.get("fineRatingPenalty"),
      DEFAULT_SETTINGS.fineRatingPenalty
    ),
    uniformRenewalMonths: parseNumber(
      map.get("uniformRenewalMonths"),
      DEFAULT_SETTINGS.uniformRenewalMonths
    ),
    warningAbsenceThreshold: parseNumber(
      map.get("warningAbsenceThreshold"),
      DEFAULT_SETTINGS.warningAbsenceThreshold
    ),
  };
}

/**
 * GET /api/settings — any authenticated user.
 * → SystemSettings (defaults for any missing key).
 */
export async function GET(req: NextRequest) {
  const { error } = await requireUser(req);
  if (error) return error;

  return ok(await loadSettings());
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * PUT /api/settings — SUPER ADMIN ONLY.
 * Body: SystemSettings (partial fields allowed; omitted keys keep their
 * current value) → SystemSettings. Upserts every key, audits the change.
 */
export async function PUT(req: NextRequest) {
  const { user: actor, error } = await requireUser(req);
  if (error) return error;
  if (actor.role !== "super_admin") {
    return fail("Super administrator access required", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await parseBody<Record<string, unknown>>(req);
  } catch {
    return fail("Invalid request body");
  }

  const current = await loadSettings();
  const next: SystemSettings = { ...current };

  if (body.companyName !== undefined) {
    if (typeof body.companyName !== "string" || !body.companyName.trim()) {
      return fail("Company name is required");
    }
    next.companyName = body.companyName.trim();
  }
  for (const key of ["companyLogo", "companyAddress", "companyPhone"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string") {
        return fail(`${key} must be a string`);
      }
      next[key] = body[key].trim();
    }
  }
  if (body.currency !== undefined) {
    if (typeof body.currency !== "string" || !body.currency.trim()) {
      return fail("Currency is required");
    }
    next.currency = body.currency.trim();
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !body.timezone.trim()) {
      return fail("Timezone is required");
    }
    next.timezone = body.timezone.trim();
  }
  if (body.employeeIdPrefix !== undefined) {
    if (
      typeof body.employeeIdPrefix !== "string" ||
      !body.employeeIdPrefix.trim()
    ) {
      return fail("Employee ID prefix is required");
    }
    next.employeeIdPrefix = body.employeeIdPrefix.trim();
  }
  if (body.warningRatingPenalty !== undefined) {
    const v = toNumber(body.warningRatingPenalty);
    if (v === null || v < 0 || v > 5) {
      return fail("Warning rating penalty must be a number between 0 and 5");
    }
    next.warningRatingPenalty = v;
  }
  if (body.fineRatingPenalty !== undefined) {
    const v = toNumber(body.fineRatingPenalty);
    if (v === null || v < 0 || v > 5) {
      return fail("Fine rating penalty must be a number between 0 and 5");
    }
    next.fineRatingPenalty = v;
  }
  if (body.uniformRenewalMonths !== undefined) {
    const v = toNumber(body.uniformRenewalMonths);
    if (v === null || !Number.isInteger(v) || v < 1 || v > 120) {
      return fail("Uniform renewal months must be a whole number between 1 and 120");
    }
    next.uniformRenewalMonths = v;
  }
  if (body.warningAbsenceThreshold !== undefined) {
    const v = toNumber(body.warningAbsenceThreshold);
    if (v === null || !Number.isInteger(v) || v < 1 || v > 60) {
      return fail("Warning absence threshold must be a whole number between 1 and 60");
    }
    next.warningAbsenceThreshold = v;
  }

  const entries: [string, string][] = [
    ["companyName", next.companyName],
    ["companyLogo", next.companyLogo],
    ["companyAddress", next.companyAddress],
    ["companyPhone", next.companyPhone],
    ["currency", next.currency],
    ["timezone", next.timezone],
    ["employeeIdPrefix", next.employeeIdPrefix],
    ["warningRatingPenalty", String(next.warningRatingPenalty)],
    ["fineRatingPenalty", String(next.fineRatingPenalty)],
    ["uniformRenewalMonths", String(next.uniformRenewalMonths)],
    ["warningAbsenceThreshold", String(next.warningAbsenceThreshold)],
  ];

  await db.$transaction(
    entries.map(([key, value]) =>
      db.systemSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      })
    )
  );

  await logAudit({
    actor,
    action: "settings.update",
    entity: "settings",
    before: current,
    after: next,
  });

  return ok(next);
}
