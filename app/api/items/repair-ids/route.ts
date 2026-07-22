import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-auth";
import { repairDuplicateItemIds } from "@/lib/sheets";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const result = await repairDuplicateItemIds();
    return NextResponse.json({
      items: result.items,
      repaired: result.repaired,
      count: result.repaired.length,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/items/repair-ids", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to repair duplicate item IDs",
      },
      { status: 500 }
    );
  }
}
