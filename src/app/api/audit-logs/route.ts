import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { fail, ok, requireUser } from "@/lib/api-helpers";

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
 * GET /api/audit-logs — SUPER ADMIN ONLY
 * Query: page (1-based), pageSize (default 20), entity (exact filter),
 * query (contains match on actorName / action / entity).
 * → { data: AuditLogRecord[], total, page, pageSize } newest first.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(sp.get("pageSize") ?? "20", 10) || 20)
  );
  const entity = sp.get("entity")?.trim() || undefined;
  const query = sp.get("query")?.trim() || undefined;

  const where: Prisma.AuditLogWhereInput = {};
  if (entity) where.entity = entity;
  if (query) {
    where.OR = [
      { actorName: { contains: query, mode: "insensitive" } },
      { action: { contains: query, mode: "insensitive" } },
      { entity: { contains: query, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    data: rows.map((r) => ({
      id: r.id,
      actorName: r.actorName,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
}
