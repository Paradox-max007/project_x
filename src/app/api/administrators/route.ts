import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { ALWAYS_ALLOWED, MENU_KEYS, type SessionUser } from "@/lib/permissions";
import { fail, logAudit, ok, parseBody, requireUser } from "@/lib/api-helpers";
import type { AdministratorRecord, Role } from "@/types/manpower";

// ---------------------------------------------------------------------------
// Shared helpers (duplicated in [id]/route.ts — route modules may only export
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

/** Effective permission map for one admin (mirrors permissionsForUser). */
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
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/administrators — SUPER ADMIN ONLY
 * → AdministratorRecord[] (each with a full permissions map).
 */
export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  const users = await db.adminUser.findMany({
    include: { permissions: true },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });

  return ok(users.map(toRecord));
}

/**
 * POST /api/administrators — SUPER ADMIN ONLY
 * Body: { fullName, email, password, role, permissions? } → AdministratorRecord
 * Email is normalized to lowercase and must be unique (409 otherwise).
 * For non-super-admins the provided permissions map is persisted as
 * Permission rows (merged over the always-allowed defaults).
 */
export async function POST(req: NextRequest) {
  const { user: actor, error } = await requireSuperAdmin(req);
  if (error) return error;

  let body: {
    fullName?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
    permissions?: unknown;
  };
  try {
    body = await parseBody<{
      fullName?: unknown;
      email?: unknown;
      password?: unknown;
      role?: unknown;
      permissions?: unknown;
    }>(req);
  } catch {
    return fail("Invalid request body");
  }

  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!fullName) return fail("Full name is required");
  if (!email) return fail("Email is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Please enter a valid email address");
  }
  if (password.length < 8) {
    return fail("Password must be at least 8 characters");
  }

  let role: Role;
  if (body.role === "super_admin") role = "super_admin";
  else if (body.role === "admin") role = "admin";
  else return fail("Role must be super_admin or admin");

  const existing = await db.adminUser.findUnique({ where: { email } });
  if (existing) {
    return fail("An administrator with this email already exists", 409);
  }

  const created = await db.adminUser.create({
    data: {
      email,
      fullName,
      passwordHash: hashPassword(password),
      role,
      isActive: true,
    },
  });

  let permissions: Record<string, boolean>;
  if (role === "super_admin") {
    permissions = buildPermissionMap("super_admin", []);
  } else {
    // Merge the provided map over the defaults (dashboard + uniform_registry
    // are always allowed), then persist explicit rows for every menu key.
    const defaults = buildPermissionMap("admin", []);
    permissions = { ...defaults };
    if (isRecord(body.permissions)) {
      for (const key of MENU_KEYS) {
        const value = body.permissions[key];
        if (typeof value === "boolean") permissions[key] = value;
      }
    }
    await db.$transaction(
      MENU_KEYS.map((key) =>
        db.permission.upsert({
          where: { userId_menuKey: { userId: created.id, menuKey: key } },
          create: { userId: created.id, menuKey: key, allowed: permissions[key] },
          update: { allowed: permissions[key] },
        })
      )
    );
  }

  const record: AdministratorRecord = {
    id: created.id,
    email: created.email,
    fullName: created.fullName,
    role,
    isActive: created.isActive,
    permissions,
    lastLoginAt: null,
    createdAt: created.createdAt.toISOString(),
  };

  await logAudit({
    actor,
    action: "admin.create",
    entity: "admin_user",
    entityId: created.id,
    after: { email, fullName, role, permissions },
  });

  return ok(record);
}
