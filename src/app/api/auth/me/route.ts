import { NextRequest } from "next/server";
import { ok, requireUser } from "@/lib/api-helpers";
import type { AuthUser } from "@/types/manpower";

/**
 * GET /api/auth/me
 * → AuthUser (id, email, fullName, role, permissions) or 401.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser(req);
  if (error) return error;
  const authUser: AuthUser = user;
  return ok(authUser);
}
