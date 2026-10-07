import "server-only";
import { db } from "@/lib/db";
import { permissionsForUser, type SessionUser } from "@/lib/permissions";

export const SESSION_COOKIE = "asm_session";
const SESSION_DAYS = 7;

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { token, userId, expiresAt } });
  return token;
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { token } });
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const user = session.user;
  if (!user.isActive) return null;
  const permissions = await permissionsForUser(user.id, user.role);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as "super_admin" | "admin",
    permissions,
  };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
