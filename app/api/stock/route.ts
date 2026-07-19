import { NextResponse } from "next/server";
import { clearAlertIfRecovered, sendLowStockAlert } from "@/lib/alerts";
import { requireClerk } from "@/lib/auth/api-auth";
import {
  appendTransaction,
  applyClosingStock,
  getInventoryItemById,
  updateStockIn,
} from "@/lib/sheets";
import { validateClosingStock, validateStockIn } from "@/lib/stock";
import type { StockMovementRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { email, uid } = await requireClerk(request);
    const body = (await request.json()) as StockMovementRequest;

    if (!body.itemId || !body.type) {
      return NextResponse.json(
        { error: "itemId and type are required." },
        { status: 400 }
      );
    }

    if (body.type !== "in" && body.type !== "close") {
      return NextResponse.json(
        { error: "Invalid movement type. Use in or close." },
        { status: 400 }
      );
    }

    const item = await getInventoryItemById(body.itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    const userEmail = email ?? uid;

    if (body.type === "in") {
      const quantity = Number(body.quantity);
      const validationError = validateStockIn(quantity);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const updatedItem = await updateStockIn(item, quantity);

      await appendTransaction({
        timestamp: new Date().toISOString(),
        itemId: updatedItem.itemId,
        itemName: updatedItem.itemName,
        type: "in",
        quantity,
        userEmail,
        notes: body.notes?.trim() ?? "",
        destination: "",
        opening: null,
        add: null,
        closing: null,
      });

      await clearAlertIfRecovered(updatedItem);
      await sendLowStockAlert(updatedItem);

      return NextResponse.json({ item: updatedItem });
    }

    const closingStock = Number(body.closingStock);
    const validationError = validateClosingStock(item, closingStock);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const openingBefore = item.openingStock;
    const addBefore = item.stockIn;
    const { item: updatedItem, sales } = await applyClosingStock(
      item,
      closingStock
    );

    await appendTransaction({
      timestamp: new Date().toISOString(),
      itemId: updatedItem.itemId,
      itemName: updatedItem.itemName,
      type: "close",
      quantity: sales,
      userEmail,
      notes: body.notes?.trim() ?? "",
      destination: "",
      opening: openingBefore,
      add: addBefore,
      closing: closingStock,
    });

    await clearAlertIfRecovered(updatedItem);
    await sendLowStockAlert(updatedItem);

    return NextResponse.json({
      item: updatedItem,
      sales,
      amount: sales * updatedItem.price,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/stock", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update stock",
      },
      { status: 500 }
    );
  }
}
