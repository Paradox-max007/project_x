import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, requirePermission, logAudit } from "@/lib/api-helpers";
import { decryptField } from "@/lib/crypto";
import {
  getSettings,
  paginationOf,
  parseWith,
  routeGuard,
  todayUtc,
  addDays,
} from "@/lib/ops-helpers";
import { UNIFORM_ISSUE_INCLUDE, toUniformIssueRecord } from "@/lib/ops-serializers";
import { issueUniform, resolveUniformItems } from "@/lib/uniform-service";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/uniform-issues?query&siteId&renewal=upcoming|overdue&page&pageSize
// List responses mask the document number. Because documentNumber is
// encrypted at rest it cannot be contains-searched in SQL — when a query is
// supplied, matching (incl. decrypted document numbers) is done in memory
// before pagination.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "uniform_registry");
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim().toLowerCase() ?? "";
    const siteId = url.searchParams.get("siteId")?.trim() ?? "";
    const renewal = url.searchParams.get("renewal")?.trim() ?? "";
    const { page, pageSize, skip, take } = paginationOf(url, 10);

    if (renewal && renewal !== "upcoming" && renewal !== "overdue") {
      return fail("Invalid renewal filter (expected 'upcoming' or 'overdue')", 400);
    }

    const today = todayUtc();
    const where: Prisma.UniformIssueWhereInput = {};
    if (siteId) where.siteId = siteId;
    if (renewal === "upcoming") {
      where.renewalDate = { gte: today, lte: addDays(today, 30) };
    } else if (renewal === "overdue") {
      where.renewalDate = { lt: today };
    }

    if (query) {
      // In-memory filtering across all matching rows (documentNumber is
      // encrypted, so it can only be matched after decryption).
      const all = await db.uniformIssue.findMany({
        where,
        include: UNIFORM_ISSUE_INCLUDE,
        orderBy: [{ issuedAt: "desc" }, { uniformCode: "desc" }],
      });
      const filtered = all.filter((row) => {
        if (
          row.uniformCode.toLowerCase().includes(query) ||
          row.tokenNumber.toLowerCase().includes(query) ||
          row.employee.fullName.toLowerCase().includes(query) ||
          row.employee.employeeCode.toLowerCase().includes(query)
        ) {
          return true;
        }
        const documentNumber = decryptField(row.documentNumber);
        return documentNumber ? documentNumber.toLowerCase().includes(query) : false;
      });
      return ok({
        data: filtered
          .slice(skip, skip + take)
          .map((row) => toUniformIssueRecord(row, { maskDocument: true })),
        total: filtered.length,
        page,
        pageSize,
      });
    }

    const [total, rows] = await Promise.all([
      db.uniformIssue.count({ where }),
      db.uniformIssue.findMany({
        where,
        include: UNIFORM_ISSUE_INCLUDE,
        orderBy: [{ issuedAt: "desc" }, { uniformCode: "desc" }],
        skip,
        take,
      }),
    ]);

    return ok({
      data: rows.map((row) => toUniformIssueRecord(row, { maskDocument: true })),
      total,
      page,
      pageSize,
    });
  });
}

// ---------------------------------------------------------------------------
// POST /api/uniform-issues — register a new uniform/PPE issue
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  quantity: z
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
});

const createSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  documentType: z
    .string()
    .min(1, "Document type is required")
    .max(50, "Document type is too long"),
  documentNumber: z
    .string()
    .min(1, "Document number is required")
    .max(100, "Document number is too long"),
  siteId: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1, "At least one uniform item is required"),
});

export async function POST(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requirePermission(req, "uniform_registry");
    if (auth.error) return auth.error;

    const { data: body, error: parseError } = await parseWith(req, createSchema);
    if (parseError) return parseError;

    const employee = await db.employee.findUnique({
      where: { id: body.employeeId },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        status: true,
        currentSiteId: true,
      },
    });
    if (!employee) return fail("Employee not found", 404);
    if (employee.status !== "active") return fail("Employee is not active", 400);

    // Site: provided site (must exist and be active) or the employee's current site.
    let siteId = employee.currentSiteId;
    if (body.siteId) {
      const site = await db.site.findUnique({
        where: { id: body.siteId },
        select: { id: true, isActive: true },
      });
      if (!site) return fail("Site not found", 404);
      if (!site.isActive) return fail("Site is not active", 400);
      siteId = site.id;
    }

    let teamLeaderName: string | null = null;
    if (siteId) {
      const site = await db.site.findUnique({
        where: { id: siteId },
        include: { teamLeader: { select: { fullName: true } } },
      });
      teamLeaderName = site?.teamLeader?.fullName ?? null;
    }

    const items = await resolveUniformItems(body.items);
    if (!items) return fail("One or more uniform items are invalid", 400);

    const settings = await getSettings();
    const issueId = await issueUniform({
      employeeId: employee.id,
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      siteId,
      teamLeaderName,
      items,
      isRenewal: false,
      previousIssueId: null,
      renewalMonths: settings.uniformRenewalMonths,
      createdByName: auth.user.fullName,
    });

    const full = await db.uniformIssue.findUniqueOrThrow({
      where: { id: issueId },
      include: UNIFORM_ISSUE_INCLUDE,
    });

    await logAudit({
      actor: auth.user,
      action: "uniform.issue",
      entity: "uniform_issue",
      entityId: issueId,
      after: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        uniformCode: full.uniformCode,
        tokenNumber: full.tokenNumber,
        items: items.length,
        renewalDate: full.renewalDate.toISOString(),
      },
    });

    // Creator sees the full document number.
    return ok(toUniformIssueRecord(full, { maskDocument: false }));
  });
}
