import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-auth";
import { MERRY_MARY_CATALOG } from "@/lib/merry-mary-catalog";
import { replaceInventoryCatalog } from "@/lib/sheets";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const items = await replaceInventoryCatalog(MERRY_MARY_CATALOG);
    return NextResponse.json({
      items,
      count: items.length,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/items/seed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Merry Mary catalog",
      },
      { status: 500 }
    );
  }
}
