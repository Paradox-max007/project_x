import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ALWAYS_ALLOWED, MENU_KEYS, type SessionUser } from "@/lib/permissions";
import { fail, logAudit, ok, parseBody, requireUser } from "@/lib/api-helpers";
import type { AdministratorRecord, Role } from "@/types/manpower";

// ---------------------------------------------------------------------------
// Shared helpers (duplicated from ../route.ts — route modules may only export
// HTTP handlers, so no shared exports are possible).
// ---------------------------------------------------------------------------

type AdminWithPermissions = Prisma.AdminUserGetPayload<{
  include: { permissions: true };
}>;

async function requireSuperAdmin(
  req: NextRequest
): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const { user, error } = await requireUser(req);
  if (error) return { user: null, error };
  if (user.role !== "super_admin") {
    return {
      user: null,
      error: fail("Super administrator access required", 403),
    };
  }
  return { user, error: null };
}

function buildPermissionMap(
  role: string,
  rows: { menuKey: string; allowed: boolean }[]
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of MENU_KEYS) {
    result[key] = role === "super_admin" || ALWAYS_ALLOWED.includes(key);
  }
  if (role === "super_admin") return result;
  for (const row of rows) result[row.menuKey] = row.allowed;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(user: AdminWithPermissions): AdministratorRecord {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role === "super_admin" ? "super_admin" : "admin",
    isActive: user.isActive,
    permissions: buildPermissionMap(user.role, user.permissions),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * PATCH /api/administrators/[id] — SUPER ADMIN ONLY
 * Body: { fullName?, isActive?, role?, permissions? } → AdministratorRecord
 * - cannot change own role or deactivate self (400)
 * - permissions (when provided) are merged over the target's current state
 *   and persisted as explicit Permission rows for non-super-admins
 * - promoting to super_admin clears the (now redundant) permission rows
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: actor, error } = await requireSuperAdmin(req);
  if (error) return error;

  const { id } = await params;

  const target = await db.adminUser.findUnique({
    where: { id },
    include: { permissions: true },
  });
  if (!target) return fail("Administrator not found", 404);

  let body: {
    fullName?: unknown;
    isActive?: unknown;
    role?: unknown;
    permissions?: unknown;
  };
  try {
    body = await parseBody<{
      fullName?: unknown;
      isActive?: unknown;
      role?: unknown;
      permissions?: unknown;
    }>(req);
  } catch {
    return fail("Invalid request body");
  }

  const data: { fullName?: string; isActive?: boolean; role?: string } = {};

  if (body.fullName !== undefined) {
    if (typeof body.fullName !== "string" || !body.fullName.trim()) {
      return fail("Full name cannot be empty");
    }
    data.fullName = body.fullName.trim();
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return fail("isActive must be a boolean");
    }
    data.isActive = body.isActive;
  }

  let newRole: Role | undefined;
  if (body.role !== undefined) {
    if (body.role === "super_admin") newRole = "super_admin";
    else if (body.role === "admin") newRole = "admin";
    else return fail("Role must be super_admin or admin");
    data.role = newRole;
  }

  // Self-protection: an admin may not demote or disable their own account.
  if (
    id === actor.id &&
    (body.role !== undefined || data.isActive === false)
  ) {
    return fail("You cannot modify your own role or status");
  }

  const currentRole: Role =
    target.role === "super_admin" ? "super_admin" : "admin";
  const effectiveRole: Role = newRole ?? currentRole;

  const updated = await db.adminUser.update({ where: { id }, data });

  const provided = isRecord(body.permissions) ? body.permissions : null;
  if (provided) {
    if (effectiveRole !== "super_admin") {
      // Merge provided values over the target's CURRENT permission state so a
      // partial payload only touches the keys it mentions.
      const merged = buildPermissionMap("admin", target.permissions);
      for (const key of MENU_KEYS) {
        const value = provided[key];
        if (typeof value === "boolean") merged[key] = value;
      }
      await db.$transaction(
        MENU_KEYS.map((key) =>
          db.permission.upsert({
            where: { userId_menuKey: { userId: id, menuKey: key } },
            create: { userId: id, menuKey: key, allowed: merged[key] },
            update: { allowed: merged[key] },
          })
        )
      );
    } else {
      // Target is a super admin — permission rows are bypassed, drop them.
      await db.permission.deleteMany({ where: { userId: id } });
    }
  } else if (effectiveRole === "super_admin" && currentRole !== "super_admin") {
    // Promoted to super admin without a permissions payload — clean up rows.
    await db.permission.deleteMany({ where: { userId: id } });
  }

  const fresh = await db.adminUser.findUnique({
    where: { id },
    include: { permissions: true },
  });
  const record = fresh ? toRecord(fresh) : toRecord({ ...target, ...updated });

  await logAudit({
    actor,
    action: "admin.update",
    entity: "admin_user",
    entityId: id,
    before: {
      fullName: target.fullName,
      role: target.role,
      isActive: target.isActive,
    },
    after: {
      fullName: updated.fullName,
      role: updated.role,
      isActive: updated.isActive,
    },
  });

  return ok(record);
}
