import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, ok, requirePermission } from "@/lib/api-helpers";
import type { Notification } from "@prisma/client";
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
 * POST /api/notifications/[id]/read — permission: "notifications"
 * Marks one of the session user's own notifications as read (idempotent).
 * → NotificationRecord. Not owned / missing → 404.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission(req, "notifications");
  if (error) return error;

  const { id } = await params;

  const existing = await db.notification.findFirst({
    where: { id, recipientId: user.id },
  });
  if (!existing) {
    return fail("Notification not found", 404);
  }

  const updated = existing.read
    ? existing
    : await db.notification.update({ where: { id }, data: { read: true } });

  return ok(toRecord(updated));
}
