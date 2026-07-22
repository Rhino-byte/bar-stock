import { NextResponse } from "next/server";
import { requireClerk } from "@/lib/auth/api-auth";
import {
  appendTransactions,
  applyClosingStockBatch,
  getInventoryItems,
} from "@/lib/sheets";
import { validateClosingStock } from "@/lib/stock";
import type { InventoryItem, Transaction } from "@/lib/types";

type CloseBatchEntry = {
  itemId: string;
  closingStock: number;
  notes?: string;
};

type CloseBatchResultRow = {
  item: InventoryItem;
  sales: number;
  amount: number;
};

export async function POST(request: Request) {
  try {
    const { email, uid } = await requireClerk(request);
    const body = (await request.json()) as { entries?: CloseBatchEntry[] };
    const entries = body.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "entries array is required." },
        { status: 400 }
      );
    }

    if (entries.length > 200) {
      return NextResponse.json(
        { error: "Too many entries in one batch (max 200)." },
        { status: 400 }
      );
    }

    const items = await getInventoryItems();
    const byId = new Map(items.map((item) => [item.itemId, item]));
    const userEmail = email ?? uid;
    const timestamp = new Date().toISOString();

    const prepared: Array<{
      item: InventoryItem;
      closingEntered: number;
      notes: string;
    }> = [];
    const errors: string[] = [];

    const seen = new Set<string>();
    for (const entry of entries) {
      if (!entry?.itemId) {
        errors.push("Each entry needs itemId.");
        continue;
      }
      if (seen.has(entry.itemId)) {
        errors.push(`Duplicate itemId in batch: ${entry.itemId}`);
        continue;
      }
      seen.add(entry.itemId);

      const item = byId.get(entry.itemId);
      if (!item) {
        errors.push(`Item not found: ${entry.itemId}`);
        continue;
      }

      const closingStock = Number(entry.closingStock);
      const validationError = validateClosingStock(item, closingStock);
      if (validationError) {
        errors.push(`${item.itemName}: ${validationError}`);
        continue;
      }

      prepared.push({
        item,
        closingEntered: closingStock,
        notes: entry.notes?.trim() ?? "",
      });
    }

    if (errors.length) {
      return NextResponse.json(
        { error: errors[0], errors },
        { status: 400 }
      );
    }

    if (!prepared.length) {
      return NextResponse.json(
        { error: "No valid closing entries." },
        { status: 400 }
      );
    }

    const applied = await applyClosingStockBatch(
      prepared.map(({ item, closingEntered }) => ({ item, closingEntered }))
    );

    const transactions: Transaction[] = prepared.map((row, index) => ({
      timestamp,
      itemId: row.item.itemId,
      itemName: row.item.itemName,
      type: "close" as const,
      quantity: applied[index].sales,
      userEmail,
      notes: row.notes,
      destination: "",
      opening: row.item.openingStock,
      add: row.item.stockIn,
      closing: row.closingEntered,
    }));

    await appendTransactions(transactions);

    const results: CloseBatchResultRow[] = applied.map(({ item, sales }) => ({
      item,
      sales,
      amount: sales * item.price,
    }));

    return NextResponse.json({
      count: results.length,
      results,
      items: results.map((row) => row.item),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/stock/close-batch", error);
    const message =
      error instanceof Error ? error.message : "Failed to save closing stock batch";
    const isQuota =
      /quota|rate.?limit|429|RESOURCE_EXHAUSTED/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isQuota ? 429 : 500 }
    );
  }
}
