import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-helpers";
import type { Notification, Prisma } from "@prisma/client";
import type { NotificationRecord } from "@/types/manpower";

function toRecord(n: Notification): NotificationRecord {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    referenceType: n.referenceType,
    referenceId: n.referenceId,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * GET /api/notifications?unread=true — permission: "notifications"
 * Own notifications (recipientId = session user), newest first, limit 50.
 * → NotificationRecord[]
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requirePermission(req, "notifications");
  if (error) return error;

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";
  const where: Prisma.NotificationWhereInput = {
    recipientId: user.id,
  };
  if (unreadOnly) where.read = false;

  const rows = await db.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok(rows.map(toRecord));
}
