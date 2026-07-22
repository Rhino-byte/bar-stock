import { NextResponse } from "next/server";
import { requireClerkOrAdmin } from "@/lib/auth/api-auth";
import { buildRecentCloseReport } from "@/lib/recent-closes";
import { getInventoryItems, getTransactions } from "@/lib/sheets";

export async function GET(request: Request) {
  try {
    await requireClerkOrAdmin(request);
    const [items, transactions] = await Promise.all([
      getInventoryItems(),
      getTransactions(),
    ]);
    const report = buildRecentCloseReport(items, transactions);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/recent-closes", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load recent closes",
      },
      { status: 500 }
    );
  }
}
