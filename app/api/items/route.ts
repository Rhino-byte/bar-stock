import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-auth";
import {
  createInventoryItem,
  deleteInventoryItem,
  updateItemMetadata,
} from "@/lib/sheets";
import type { ItemCreateRequest, ItemUpdateRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as ItemCreateRequest;

    if (!body.itemName?.trim()) {
      return NextResponse.json(
        { error: "itemName is required." },
        { status: 400 }
      );
    }

    const item = await createInventoryItem(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/items", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create item",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as ItemUpdateRequest;

    if (!body.itemId) {
      return NextResponse.json({ error: "itemId is required." }, { status: 400 });
    }

    const item = await updateItemMetadata(body);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("PUT /api/items", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as { itemId?: string };

    if (!body.itemId) {
      return NextResponse.json({ error: "itemId is required." }, { status: 400 });
    }

    await deleteInventoryItem(body.itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("DELETE /api/items", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete item",
      },
      { status: 500 }
    );
  }
}
