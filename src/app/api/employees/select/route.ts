import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requireUser } from "@/lib/api-helpers";

// ---------------------------------------------------------------------------
// GET /api/employees/select — lightweight picker list.
// Static segment "select" takes precedence over the [id] dynamic segment.
// Available to ANY authenticated user: it only exposes id/code/name/position
// of active employees, which every operational role needs for pickers.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { error } = await requireUser(req);
  if (error) return error;

  const employees = await db.employee.findMany({
    where: { status: "active" },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      position: true,
      currentSiteId: true,
    },
    orderBy: { fullName: "asc" },
  });

  return ok(
    employees.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      position: e.position,
      siteId: e.currentSiteId,
    }))
  );
}
