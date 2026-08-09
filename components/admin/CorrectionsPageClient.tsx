"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ItemSearchCombobox } from "@/components/clerk/ItemSearchCombobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { fetchInventory, submitStockAdjustment } from "@/lib/api-client";
import { todayDateKey } from "@/lib/dates";
import { formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";

type CorrectionKind = "sales" | "stock";

export function CorrectionsPageClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [kind, setKind] = useState<CorrectionKind>("sales");
  const [itemId, setItemId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayDateKey());
  const [salesDelta, setSalesDelta] = useState("");
  const [closingStock, setClosingStock] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchInventory()
      .then(setItems)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load items")
      )
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => items.find((item) => item.itemId === itemId) ?? null,
    [items, itemId]
  );

  const preview = useMemo(() => {
    if (!selected) return null;
    if (kind === "sales") {
      const delta = Number(salesDelta);
      if (!Number.isFinite(delta) || delta === 0) return null;
      return {
        openingAfter: selected.openingStock - delta,
        closingAfter: selected.closingStock - delta,
        delta,
      };
    }
    const next = Number(closingStock);
    if (!Number.isFinite(next) || next < 0) return null;
    return {
      openingAfter: next,
      closingAfter: next,
      delta: next - selected.closingStock,
    };
  }, [selected, kind, salesDelta, closingStock]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!itemId) {
      toast.error("Select an item.");
      return;
    }
    if (!notes.trim()) {
      toast.error("Notes are required.");
      return;
    }

    setSubmitting(true);
    try {
      if (kind === "sales") {
        const delta = Number(salesDelta);
        if (!Number.isFinite(delta) || delta === 0) {
          toast.error("Enter a non-zero sales delta.");
          return;
        }
        const result = await submitStockAdjustment({
          kind: "sales",
          itemId,
          effectiveDate,
          salesDelta: delta,
          notes,
        });
        setItems((current) =>
          current.map((row) =>
            row.itemId === result.item.itemId ? result.item : row
          )
        );
        toast.success(
          `Sales ${delta > 0 ? "+" : ""}${delta} for ${result.item.itemName}. On-hand ${formatNumber(result.log.stockBefore)} → ${formatNumber(result.log.stockAfter)}.`
        );
      } else {
        const next = Number(closingStock);
        if (!Number.isFinite(next) || next < 0) {
          toast.error("Enter a valid stock count.");
          return;
        }
        const result = await submitStockAdjustment({
          kind: "stock",
          itemId,
          closingStock: next,
          notes,
        });
        setItems((current) =>
          current.map((row) =>
            row.itemId === result.item.itemId ? result.item : row
          )
        );
        toast.success(
          `Stock set for ${result.item.itemName}: ${formatNumber(result.log.stockBefore)} → ${formatNumber(result.log.stockAfter)}.`
        );
      }
      setSalesDelta("");
      setClosingStock("");
      setNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <LoadingState
        label="Loading items"
        layout="centered"
        className="min-h-[40vh]"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Corrections
        </h1>
        <p className="text-sm text-slate-500">
          Fix missed or wrong sales for a date, or set live stock to a physical
          count. Updates Sheet1, Transactions, and the CorrectionsLog tab
          together.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply correction</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={kind === "sales" ? "default" : "outline"}
                onClick={() => setKind("sales")}
              >
                Fix sales for a date
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kind === "stock" ? "default" : "outline"}
                onClick={() => setKind("stock")}
              >
                Set current stock
              </Button>
            </div>

            <ItemSearchCombobox
              items={items}
              value={itemId}
              onChange={setItemId}
              disabled={submitting}
            />

            {selected && (
              <p className="text-sm text-slate-600">
                Current — Opening {formatNumber(selected.openingStock)}, ADD{" "}
                {formatNumber(selected.stockIn)}, Closing{" "}
                {formatNumber(selected.closingStock)}
              </p>
            )}

            {kind === "sales" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="effective-date">Effective date</Label>
                  <Input
                    id="effective-date"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sales-delta">Sales delta</Label>
                  <Input
                    id="sales-delta"
                    type="number"
                    value={salesDelta}
                    onChange={(e) => setSalesDelta(e.target.value)}
                    placeholder="e.g. 3 or -2"
                    disabled={submitting}
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Positive = missed sales; negative = overcounted. Opening and
                    closing move by the opposite amount.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="closing-stock">Physical count (B.B.F)</Label>
                <Input
                  id="closing-stock"
                  type="number"
                  min={0}
                  value={closingStock}
                  onChange={(e) => setClosingStock(e.target.value)}
                  disabled={submitting}
                  required
                />
                <p className="text-xs text-slate-500">
                  Sets Opening and Closing to this value. Does not change
                  reported sales.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="correction-notes">Notes (required)</Label>
              <Input
                id="correction-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why is this being corrected?"
                disabled={submitting}
                required
              />
            </div>

            {preview && selected && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {kind === "sales" ? (
                  <p>
                    Sales {preview.delta > 0 ? "+" : ""}
                    {formatNumber(preview.delta)} → Opening{" "}
                    {formatNumber(selected.openingStock)} →{" "}
                    {formatNumber(preview.openingAfter)}, Closing{" "}
                    {formatNumber(selected.closingStock)} →{" "}
                    {formatNumber(preview.closingAfter)}
                  </p>
                ) : (
                  <p>
                    Set stock {formatNumber(selected.closingStock)} →{" "}
                    {formatNumber(preview.closingAfter)}
                  </p>
                )}
                {(preview.openingAfter < 0 || preview.closingAfter < 0) && (
                  <p className="mt-1 font-medium text-red-600">
                    This would make stock negative — change the delta.
                  </p>
                )}
              </div>
            )}

            <Button type="submit" disabled={submitting || !itemId}>
              {submitting ? "Applying…" : "Apply correction"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
