import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, requireUser, logAudit } from "@/lib/api-helpers";
import { parseWith, routeGuard } from "@/lib/ops-helpers";
import type { UniformItemRecord } from "@/types/manpower";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/uniform-items — full catalogue (any authenticated user)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    const items = await db.uniformItem.findMany({ orderBy: { name: "asc" } });
    const data: UniformItemRecord[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      isActive: item.isActive,
    }));
    return ok(data);
  });
}

// ---------------------------------------------------------------------------
// POST /api/uniform-items — add a catalogue item (any authenticated user)
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
  description: z.string().max(500, "Description must be 500 characters or fewer").nullable().optional(),
});

export async function POST(req: NextRequest) {
  return routeGuard(async () => {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    const { data: body, error: parseError } = await parseWith(req, createSchema);
    if (parseError) return parseError;

    const name = body.name.trim();
    const duplicate = await db.uniformItem.findFirst({ where: { name } });
    if (duplicate) return fail("A uniform item with this name already exists", 400);

    const created = await db.uniformItem.create({
      data: { name, description: body.description ?? null, isActive: true },
    });

    await logAudit({
      actor: auth.user,
      action: "uniform_item.create",
      entity: "uniform_item",
      entityId: created.id,
      after: { name: created.name },
    });

    return ok({
      id: created.id,
      name: created.name,
      description: created.description,
      isActive: created.isActive,
    });
  });
}
