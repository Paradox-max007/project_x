import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-helpers";

/**
 * POST /api/notifications/read-all — permission: "notifications"
 * Marks all of the session user's unread notifications as read.
 * → { ok: true }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requirePermission(req, "notifications");
  if (error) return error;

  await db.notification.updateMany({
    where: { recipientId: user.id, read: false },
    data: { read: true },
  });

  return ok({ ok: true });
}
