import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-auth";
import { buildProfitReport, resolveProfitRange } from "@/lib/profits";
import type { ReportPeriod } from "@/lib/reports";
import { getInventoryItems, getTransactions } from "@/lib/sheets";

const PERIODS: ReportPeriod[] = ["weekly", "monthly", "4months", "custom"];

function isReportPeriod(value: string | null): value is ReportPeriod {
  return !!value && (PERIODS as string[]).includes(value);
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") ?? "monthly";

    if (!isReportPeriod(periodParam)) {
      return NextResponse.json(
        { error: "Invalid period. Use weekly, monthly, 4months, or custom." },
        { status: 400 }
      );
    }

    const range = resolveProfitRange({
      period: periodParam,
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    if ("error" in range) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const [transactions, items] = await Promise.all([
      getTransactions(),
      getInventoryItems(),
    ]);

    const report = buildProfitReport(
      items,
      transactions,
      range.from,
      range.to
    );

    return NextResponse.json({
      period: periodParam,
      ...report,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/profits", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load profits" },
      { status: 500 }
    );
  }
}
