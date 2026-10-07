import { NextRequest } from "next/server";
import {
  destroySession,
  getSessionUser,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth";
import { logAudit, ok } from "@/lib/api-helpers";

/**
 * POST /api/auth/logout
 * Destroys the session row (when present) and clears the session cookie.
 * → { ok: true }
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await getSessionUser(token);
    await destroySession(token);
    if (user) {
      await logAudit({
        actor: user,
        action: "auth.logout",
        entity: "auth",
        entityId: user.id,
      });
    }
  }
  const res = ok({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
