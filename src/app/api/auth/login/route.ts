import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { permissionsForUser } from "@/lib/permissions";
import {
  clientKey,
  fail,
  logAudit,
  ok,
  parseBody,
  rateLimit,
} from "@/lib/api-helpers";
import type { AuthUser } from "@/types/manpower";

/**
 * POST /api/auth/login
 * Body: { email, password } → { user: AuthUser } + sets `asm_session` cookie.
 * - rate limited to 10 attempts / minute / IP
 * - email lookup is case-insensitive (emails are stored lowercased)
 * - updates lastLoginAt and writes an `auth.login` audit entry
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "login"), 10, 60_000);
  if (!rl.allowed) {
    return fail("Too many attempts", 429);
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await parseBody<{ email?: unknown; password?: unknown }>(req);
  } catch {
    return fail("Invalid request body");
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return fail("Email and password are required");
  }

  const user = await db.adminUser.findUnique({ where: { email } });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return fail("Invalid email or password", 401);
  }

  if (!user.isActive) {
    return fail("This account has been disabled", 403);
  }

  const role: AuthUser["role"] =
    user.role === "super_admin" ? "super_admin" : "admin";
  const permissions = await permissionsForUser(user.id, user.role);

  const token = await createSession(user.id);
  await db.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role,
    permissions,
  };

  await logAudit({
    actor: authUser,
    action: "auth.login",
    entity: "auth",
    entityId: user.id,
    after: { email: user.email, at: new Date().toISOString() },
  });

  const res = ok({ user: authUser });
  res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return res;
}
