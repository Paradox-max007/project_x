import { db } from "@/lib/db";

/**
 * Server-side permission system.
 * The browser is never trusted for authorization — every API route re-checks
 * permissions server-side. Super Admin bypasses all menu permissions.
 */

export const MENU_KEYS = [
  "dashboard",
  "employees",
  "sites",
  "attendance",
  "leave_requests",
  "cancellation_requests",
  "warnings",
  "fines",
  "uniform_registry",
  "notifications",
  "administrators",
  "audit_logs",
  "settings",
] as const;

export type MenuKey = (typeof MENU_KEYS)[number];

/** Menus every authenticated active user can always access (per spec §5.2). */
export const ALWAYS_ALLOWED: MenuKey[] = ["dashboard", "uniform_registry"];

export type PermissionMap = Record<string, boolean>;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: "super_admin" | "admin";
  permissions: PermissionMap;
};

export async function permissionsForUser(
  userId: string,
  role: string
): Promise<PermissionMap> {
  const result: PermissionMap = {};
  for (const key of MENU_KEYS) {
    if (role === "super_admin") result[key] = true;
    else result[key] = ALWAYS_ALLOWED.includes(key);
  }
  if (role === "super_admin") return result;

  const rows = await db.permission.findMany({ where: { userId } });
  for (const row of rows) {
    result[row.menuKey] = row.allowed;
  }
  return result;
}

export function hasPermission(user: SessionUser, menuKey: MenuKey): boolean {
  if (user.role === "super_admin") return true;
  if (ALWAYS_ALLOWED.includes(menuKey)) return true;
  return user.permissions?.[menuKey] === true;
}
