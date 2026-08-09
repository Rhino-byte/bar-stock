import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-auth";
import { isValidDateKey } from "@/lib/reports";
import {
  applySalesAdjustment,
  applyStockSet,
} from "@/lib/sheets";

type AdjustBody =
  | {
      kind: "sales";
      itemId: string;
      effectiveDate: string;
      salesDelta: number;
      notes: string;
    }
  | {
      kind: "stock";
      itemId: string;
      closingStock: number;
      notes: string;
    };

export async function POST(request: Request) {
  try {
    const { email, uid } = await requireAdmin(request);
    const body = (await request.json()) as AdjustBody;
    const userEmail = email ?? uid;

    if (!body?.kind || !body.itemId) {
      return NextResponse.json(
        { error: "kind and itemId are required." },
        { status: 400 }
      );
    }

    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (!notes) {
      return NextResponse.json(
        { error: "Notes are required." },
        { status: 400 }
      );
    }

    if (body.kind === "sales") {
      const effectiveDate = body.effectiveDate?.trim() ?? "";
      if (!isValidDateKey(effectiveDate)) {
        return NextResponse.json(
          { error: "effectiveDate must be YYYY-MM-DD." },
          { status: 400 }
        );
      }
      const salesDelta = Number(body.salesDelta);
      if (!Number.isFinite(salesDelta) || salesDelta === 0) {
        return NextResponse.json(
          { error: "salesDelta must be a non-zero number." },
          { status: 400 }
        );
      }

      const result = await applySalesAdjustment({
        itemId: body.itemId,
        effectiveDate,
        salesDelta,
        notes,
        userEmail,
      });
      return NextResponse.json(result);
    }

    if (body.kind === "stock") {
      const closingStock = Number(body.closingStock);
      if (!Number.isFinite(closingStock) || closingStock < 0) {
        return NextResponse.json(
          { error: "closingStock must be zero or greater." },
          { status: 400 }
        );
      }

      const result = await applyStockSet({
        itemId: body.itemId,
        closingStock,
        notes,
        userEmail,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "kind must be sales or stock." },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/stock/adjust", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to apply correction",
      },
      { status: 500 }
    );
  }
}
