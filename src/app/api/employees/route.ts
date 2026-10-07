import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import { encryptField } from "@/lib/crypto";
import {
  dateToUtc,
  employeeCreateSchema,
  employeeSiteInclude,
  employeeSnapshot,
  emptyToNull,
  generateEmployeeCode,
  isUniqueViolation,
  readJson,
  toEmployeeProfile,
  toEmployeeRow,
  zodErrorMessage,
} from "@/lib/employee-site-api";

// ---------------------------------------------------------------------------
// GET /api/employees — paged, filterable list (permission: employees)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { error } = await requirePermission(req, "employees");
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const query = (sp.get("query") ?? "").trim();
  const siteIdParam = (sp.get("siteId") ?? "").trim();
  const statusParam = (sp.get("status") ?? "").trim() || "active";
  const sortByParam = (sp.get("sortBy") ?? "").trim() || "fullName";
  const sortDirParam = (sp.get("sortDir") ?? "").trim() || "asc";
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(sp.get("pageSize") ?? "10", 10) || 10)
  );

  if (!["asc", "desc"].includes(sortDirParam)) {
    return fail(`Invalid sortDir "${sortDirParam}" (expected asc or desc)`, 400);
  }
  if (
    !["active", "pending_deletion", "deleted", "all"].includes(statusParam)
  ) {
    return fail(
      `Invalid status "${statusParam}" (expected active, pending_deletion, deleted or all)`,
      400
    );
  }
  const dir: Prisma.SortOrder = sortDirParam === "desc" ? "desc" : "asc";
  let primary: Prisma.EmployeeOrderByWithRelationInput;
  switch (sortByParam) {
    case "employeeCode":
      primary = { employeeCode: dir };
      break;
    case "fullName":
      primary = { fullName: dir };
      break;
    case "rating":
      primary = { rating: dir };
      break;
    case "joinDate":
      primary = { joinDate: dir };
      break;
    default:
      return fail(
        `Invalid sortBy "${sortByParam}" (expected employeeCode, fullName, rating or joinDate)`,
        400
      );
  }

  // Deleted employees are EXCLUDED unless the status filter asks for them.
  const where: Prisma.EmployeeWhereInput = {};
  if (statusParam !== "all") where.status = statusParam;
  if (siteIdParam === "idle") where.currentSiteId = null;
  else if (siteIdParam) where.currentSiteId = siteIdParam;
  if (query) {
    // SQLite LIKE is case-insensitive for ASCII
    where.OR = [
      { fullName: { contains: query } },
      { employeeCode: { contains: query } },
      { phone: { contains: query } },
      { nationality: { contains: query } },
      { position: { contains: query } },
      { companyName: { contains: query } },
    ];
  }

  const [total, employees] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({
      where,
      include: employeeSiteInclude,
      orderBy: [primary, { employeeCode: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ data: employees.map(toEmployeeRow), total, page, pageSize });
}

// ---------------------------------------------------------------------------
// POST /api/employees — create (permission: employees)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { user, error } = await requirePermission(req, "employees");
  if (error) return error;

  const json = await readJson(req);
  if (!json.ok) return fail("Invalid JSON body", 400);
  const parsed = employeeCreateSchema.safeParse(json.body);
  if (!parsed.success) return fail(zodErrorMessage(parsed.error), 400);
  const input = parsed.data;

  // If a site is provided it must exist and be active.
  let site: { id: string; name: string } | null = null;
  if (input.siteId) {
    const found = await db.site.findUnique({
      where: { id: input.siteId },
      select: { id: true, name: true, isActive: true },
    });
    if (!found) return fail("Site not found", 404);
    if (!found.isActive) return fail("Site is not active", 400);
    site = found;
  }

  const data: Omit<Prisma.EmployeeUncheckedCreateInput, "employeeCode"> = {
    fullName: input.fullName,
    nationality: input.nationality,
    position: input.position,
    dateOfBirth: input.dateOfBirth ? dateToUtc(input.dateOfBirth) : null,
    phone: emptyToNull(input.phone),
    email: emptyToNull(input.email),
    address: emptyToNull(input.address),
    emergencyContact: emptyToNull(input.emergencyContact),
    joinDate: input.joinDate ? dateToUtc(input.joinDate) : null,
    companyName: emptyToNull(input.companyName),
    // Sensitive document numbers are encrypted at rest (AES-256-GCM)
    passportNumber: encryptField(emptyToNull(input.passportNumber)),
    passportStatus: emptyToNull(input.passportStatus),
    idNumber: encryptField(emptyToNull(input.idNumber)),
    idStatus: emptyToNull(input.idStatus),
    photoUrl: emptyToNull(input.photoUrl),
    rating: 5,
    status: "active",
    currentSiteId: site ? site.id : null,
  };

  // Employee codes are server-generated and never reused — retry on race.
  let createdId: string | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5 && !createdId; attempt++) {
    const employeeCode = await generateEmployeeCode();
    try {
      const emp = await db.$transaction(async (tx) => {
        const created = await tx.employee.create({
          data: { ...data, employeeCode },
        });
        if (site) {
          await tx.employeeSiteHistory.create({
            data: {
              employeeId: created.id,
              siteId: site.id,
              startDate: new Date(),
              reason: "Initial assignment",
              createdByName: user.fullName,
            },
          });
        }
        return created;
      });
      createdId = emp.id;
    } catch (e) {
      if (isUniqueViolation(e)) {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  if (!createdId) {
    console.error(
      "[api/employees] could not generate a unique employee code",
      lastError
    );
    return fail("Could not generate a unique employee code, please retry", 500);
  }

  const employee = await db.employee.findUnique({
    where: { id: createdId },
    include: employeeSiteInclude,
  });
  if (!employee) return fail("Employee created but could not be loaded", 500);

  await logAudit({
    actor: user,
    action: "employee.create",
    entity: "employee",
    entityId: employee.id,
    after: employeeSnapshot(employee), // sensitive fields masked
  });

  return ok(toEmployeeProfile(employee));
}
