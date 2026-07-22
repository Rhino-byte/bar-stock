import { NextResponse } from "next/server";
import { requireClerkOrAdmin } from "@/lib/auth/api-auth";
import { getLatestCloseBatch } from "@/lib/recent-closes";
import { getTransactions } from "@/lib/sheets";

export async function GET(request: Request) {
  try {
    await requireClerkOrAdmin(request);
    const transactions = await getTransactions();
    const batch = getLatestCloseBatch(transactions);

    if (!batch) {
      return NextResponse.json({
        closedAt: null,
        userEmail: "",
        rows: [],
      });
    }

    return NextResponse.json(batch);
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
