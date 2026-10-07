import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-helpers";

/**
 * GET /api/notifications/unread-count — permission: "notifications"
 * → { count } of own unread notifications.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requirePermission(req, "notifications");
  if (error) return error;

  const count = await db.notification.count({
    where: { recipientId: user.id, read: false },
  });

  return ok({ count });
}
