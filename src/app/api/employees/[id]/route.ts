import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, logAudit, ok, requirePermission } from "@/lib/api-helpers";
import { encryptField } from "@/lib/crypto";
import {
  assignEmployeeToSite,
  dateToUtc,
  employeeSiteInclude,
  employeeSnapshot,
  employeeUpdateSchema,
  emptyToNull,
  readJson,
  toEmployeeProfile,
  toHistoryEntry,
  zodErrorMessage,
} from "@/lib/employee-site-api";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/employees/[id] — EmployeeDetail (permission: employees)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requirePermission(req, "employees");
  if (error) return error;
  const { id } = await ctx.params;

  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      ...employeeSiteInclude,
      siteHistory: {
        orderBy: { startDate: "desc" },
        include: { site: { select: { name: true } } },
      },
      _count: { select: { warnings: true, fines: true, uniformIssues: true } },
    },
  });
  if (!employee) return fail("Employee not found", 404);

  const [pendingLeave, approvedLeave] = await Promise.all([
    db.leaveRequest.count({ where: { employeeId: id, status: "pending" } }),
    db.leaveRequest.count({ where: { employeeId: id, status: "approved" } }),
  ]);

  return ok({
    ...toEmployeeProfile(employee),
    siteHistory: employee.siteHistory.map((h) => toHistoryEntry(h)),
    warningsCount: employee._count.warnings,
    finesCount: employee._count.fines,
    leaveCount: pendingLeave + approvedLeave,
    uniformCount: employee._count.uniformIssues,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/employees/[id] — partial update (permission: employees)
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requirePermission(req, "employees");
  if (error) return error;
  const { id } = await ctx.params;

  const before = await db.employee.findUnique({
    where: { id },
    include: employeeSiteInclude,
  });
  if (!before) return fail("Employee not found", 404);
  if (before.status === "deleted") {
    return fail("Cannot update a deleted employee", 400);
  }

  const json = await readJson(req);
  if (!json.ok) return fail("Invalid JSON body", 400);
  const parsed = employeeUpdateSchema.safeParse(json.body);
  if (!parsed.success) return fail(zodErrorMessage(parsed.error), 400);
  const input = parsed.data;

  const changingSite =
    input.siteId !== undefined &&
    (input.siteId ?? null) !== (before.currentSiteId ?? null);

  // Validate the target site BEFORE applying any field updates.
  if (changingSite && input.siteId) {
    const site = await db.site.findUnique({
      where: { id: input.siteId },
      select: { isActive: true },
    });
    if (!site) return fail("Site not found", 404);
    if (!site.isActive) return fail("Site is not active", 400);
  }

  const data: Prisma.EmployeeUncheckedUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.nationality !== undefined) data.nationality = input.nationality;
  if (input.position !== undefined) data.position = input.position;
  if (input.phone !== undefined) data.phone = emptyToNull(input.phone);
  if (input.email !== undefined) data.email = emptyToNull(input.email);
  if (input.address !== undefined) data.address = emptyToNull(input.address);
  if (input.emergencyContact !== undefined)
    data.emergencyContact = emptyToNull(input.emergencyContact);
  if (input.companyName !== undefined)
    data.companyName = emptyToNull(input.companyName);
  if (input.passportStatus !== undefined)
    data.passportStatus = emptyToNull(input.passportStatus);
  if (input.idStatus !== undefined) data.idStatus = emptyToNull(input.idStatus);
  if (input.photoUrl !== undefined) data.photoUrl = emptyToNull(input.photoUrl);
  if (input.passportNumber !== undefined)
    data.passportNumber = encryptField(emptyToNull(input.passportNumber));
  if (input.idNumber !== undefined)
    data.idNumber = encryptField(emptyToNull(input.idNumber));
  if (input.dateOfBirth !== undefined)
    data.dateOfBirth = input.dateOfBirth ? dateToUtc(input.dateOfBirth) : null;
  if (input.joinDate !== undefined)
    data.joinDate = input.joinDate ? dateToUtc(input.joinDate) : null;

  if (Object.keys(data).length > 0) {
    await db.employee.update({ where: { id }, data });
  }

  if (changingSite) {
    const result = await db.$transaction((tx) =>
      assignEmployeeToSite(tx, {
        employeeId: id,
        siteId: input.siteId ?? null,
        reason: "Site changed via employee update",
        createdByName: user.fullName,
      })
    );
    if (!result.ok) return fail(result.message, result.status);
    await logAudit({
      actor: user,
      action: "employee.assign_site",
      entity: "employee",
      entityId: id,
      before: {
        siteId: before.currentSiteId,
        siteName: result.previousSiteName,
      },
      after: {
        siteId: input.siteId ?? null,
        siteName: result.newSiteName,
        reason: "Site changed via employee update",
      },
    });
  }

  const after = await db.employee.findUnique({
    where: { id },
    include: employeeSiteInclude,
  });
  if (!after) return fail("Employee not found after update", 500);

  if (Object.keys(data).length > 0 || changingSite) {
    await logAudit({
      actor: user,
      action: "employee.update",
      entity: "employee",
      entityId: id,
      before: employeeSnapshot(before), // sensitive fields masked
      after: employeeSnapshot(after),
    });
  }

  return ok(toEmployeeProfile(after));
}
