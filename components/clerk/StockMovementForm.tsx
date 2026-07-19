"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemSearchCombobox } from "@/components/clerk/ItemSearchCombobox";
import { fetchInventory, submitStockMovement } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";
import { calculateTotalStock } from "@/lib/stock";
import type { InventoryItem } from "@/lib/types";

export function StockMovementForm() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchInventory()
      .then(setItems)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load inventory")
      )
      .finally(() => setLoading(false));
  }, []);

  const selectedItem = items.find((item) => item.itemId === itemId);
  const onHand = selectedItem
    ? calculateTotalStock(selectedItem.openingStock, selectedItem.stockIn)
    : 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!itemId) {
      toast.error("Select an item.");
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a valid quantity.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitStockMovement({
        itemId,
        type: "in",
        quantity: qty,
        notes,
      });
      toast.success(`Stock in recorded for ${result.item.itemName}.`);
      setItems((current) =>
        current.map((item) => (item.itemId === result.item.itemId ? result.item : item))
      );
      setQuantity("");
      setNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Stock In</CardTitle>
        <CardDescription>Add received stock to the inventory (ADD).</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <ItemSearchCombobox
            items={items}
            value={itemId}
            onChange={setItemId}
            disabled={loading}
          />

          {selectedItem && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Opening:{" "}
              <span className="font-semibold text-slate-900">
                {formatNumber(selectedItem.openingStock)}
              </span>
              {" · "}
              ADD:{" "}
              <span className="font-semibold text-slate-900">
                {formatNumber(selectedItem.stockIn)}
              </span>
              {" · "}
              Total:{" "}
              <span className="font-semibold text-slate-900">
                {formatNumber(onHand)} {selectedItem.unit || "units"}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. delivery from supplier"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting || loading}>
            {submitting ? "Saving..." : "Add Stock"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
