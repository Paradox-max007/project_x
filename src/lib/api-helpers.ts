import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { hasPermission, type MenuKey, type SessionUser } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data as object, { status: init ?? 200 });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// ---------------------------------------------------------------------------
// Auth / permission guards for route handlers (server-side enforcement)
// ---------------------------------------------------------------------------

export async function requireUser(req: NextRequest): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(token);
  if (!user) {
    return { user: null, error: fail("Authentication required", 401) };
  }
  return { user, error: null };
}

export async function requirePermission(
  req: NextRequest,
  menuKey: MenuKey
): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const { user, error } = await requireUser(req);
  if (error) return { user: null, error };
  if (!hasPermission(user, menuKey)) {
    return { user: null, error: fail("You do not have permission to access this resource", 403) };
  }
  return { user, error: null };
}

// ---------------------------------------------------------------------------
// Audit log helper — every business mutation should be audited
// ---------------------------------------------------------------------------

export async function logAudit(opts: {
  actor: SessionUser;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.auditLog.create({
    data: {
      actorId: opts.actor.id,
      actorName: opts.actor.fullName,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId,
      before: opts.before ? JSON.stringify(opts.before) : null,
      after: opts.after ? JSON.stringify(opts.after) : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Notification helper — targeted recipients, never broadcast
// ---------------------------------------------------------------------------

export async function notify(opts: {
  recipientIds: string[];
  type: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: string;
}) {
  const unique = [...new Set(opts.recipientIds.filter(Boolean))];
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((recipientId) => ({
      recipientId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      referenceType: opts.referenceType ?? null,
      referenceId: opts.referenceId ?? null,
    })),
  });
}

/** All active super admins (used for review-type notifications). */
export async function superAdminIds(): Promise<string[]> {
  const admins = await db.adminUser.findMany({
    where: { role: "super_admin", isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** Active admins that hold a given menu permission. */
export async function permittedAdminIds(menuKey: MenuKey): Promise<string[]> {
  const admins = await db.adminUser.findMany({
    where: { isActive: true, role: "admin" },
    include: { permissions: true },
  });
  return admins
    .filter((a) => a.permissions.some((p) => p.menuKey === menuKey && p.allowed))
    .map((a) => a.id);
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter for sensitive endpoints
// ---------------------------------------------------------------------------

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) };
}

export function clientKey(req: NextRequest, scope: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `${scope}:${ip}`;
}

export function parseBody<T>(req: NextRequest): Promise<T> {
  return req.json() as Promise<T>;
}
