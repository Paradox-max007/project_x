import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import type { SessionUser } from "@/lib/permissions";
import { fail, logAudit, ok, parseBody, requireUser } from "@/lib/api-helpers";

// requireSuperAdmin is duplicated across administrator route modules (route
// modules may only export HTTP handlers).
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

/**
 * POST /api/administrators/[id]/reset-password — SUPER ADMIN ONLY
 * Body: { password } (min 8 chars) → { ok: true }
 * Hashes the new password with scrypt and audits the change.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: actor, error } = await requireSuperAdmin(req);
  if (error) return error;

  const { id } = await params;

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) return fail("Administrator not found", 404);

  let body: { password?: unknown };
  try {
    body = await parseBody<{ password?: unknown }>(req);
  } catch {
    return fail("Invalid request body");
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return fail("Password must be at least 8 characters");
  }

  await db.adminUser.update({
    where: { id },
    data: { passwordHash: hashPassword(password) },
  });

  await logAudit({
    actor,
    action: "admin.reset_password",
    entity: "admin_user",
    entityId: id,
    after: { email: target.email },
  });

  return ok({ ok: true });
}
