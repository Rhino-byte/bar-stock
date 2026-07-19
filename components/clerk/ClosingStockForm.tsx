"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchInventory, submitClosingStock } from "@/lib/api-client";
import { calculateSales, calculateTotalStock } from "@/lib/stock";
import { formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";

type ClosingDraft = Record<string, string>;

export function ClosingStockForm() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<ClosingDraft>({});

  useEffect(() => {
    fetchInventory()
      .then((list) => {
        setItems(list);
        const initial: ClosingDraft = {};
        for (const item of list) {
          initial[item.itemId] = "";
        }
        setDrafts(initial);
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load inventory")
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.itemName.toLowerCase().includes(query));
  }, [items, search]);

  const pendingEntries = useMemo(() => {
    return items
      .map((item) => {
        const raw = drafts[item.itemId]?.trim() ?? "";
        if (raw === "") return null;
        const closing = Number(raw);
        if (!Number.isFinite(closing) || closing < 0) return null;
        const total = calculateTotalStock(item.openingStock, item.stockIn);
        const sales = calculateSales(item.openingStock, item.stockIn, closing);
        return { item, closing, total, sales };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [items, drafts]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingEntries.length) {
      toast.error("Enter closing stock for at least one item.");
      return;
    }

    for (const entry of pendingEntries) {
      if (entry.closing > entry.total) {
        toast.error(
          `${entry.item.itemName}: closing (${entry.closing}) exceeds total (${entry.total}).`
        );
        return;
      }
    }

    setSubmitting(true);
    let successCount = 0;
    try {
      for (const entry of pendingEntries) {
        const result = await submitClosingStock({
          itemId: entry.item.itemId,
          closingStock: entry.closing,
        });
        setItems((current) =>
          current.map((item) =>
            item.itemId === result.item.itemId ? result.item : item
          )
        );
        setDrafts((current) => ({ ...current, [entry.item.itemId]: "" }));
        successCount += 1;
      }
      toast.success(
        `Closing stock saved for ${successCount} item${successCount === 1 ? "" : "s"}. Period rolled.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `${successCount} saved. ${error.message}`
          : "Closing stock update failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">Loading inventory…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closing Stock (B.B.F)</CardTitle>
        <CardDescription>
          Enter the physical count remaining. Sales = (Opening + ADD) − Closing. Saving
          rolls Opening to Closing and resets ADD.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="closing-search">Search items</Label>
            <Input
              id="closing-search"
              placeholder="Filter by name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="hidden max-h-[60vh] overflow-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Open</TableHead>
                  <TableHead>ADD</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>B.B.F</TableHead>
                  <TableHead>Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => {
                  const total = calculateTotalStock(item.openingStock, item.stockIn);
                  const raw = drafts[item.itemId] ?? "";
                  const closing = raw === "" ? null : Number(raw);
                  const sales =
                    closing !== null && Number.isFinite(closing)
                      ? calculateSales(item.openingStock, item.stockIn, closing)
                      : null;
                  return (
                    <TableRow key={item.itemId}>
                      <TableCell className="font-medium">{item.itemName}</TableCell>
                      <TableCell>{formatNumber(item.openingStock)}</TableCell>
                      <TableCell>{formatNumber(item.stockIn)}</TableCell>
                      <TableCell>{formatNumber(total)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="w-24"
                          value={raw}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [item.itemId]: event.target.value,
                            }))
                          }
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell>
                        {sales === null ? "—" : formatNumber(sales)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((item) => {
              const total = calculateTotalStock(item.openingStock, item.stockIn);
              const raw = drafts[item.itemId] ?? "";
              const closing = raw === "" ? null : Number(raw);
              const sales =
                closing !== null && Number.isFinite(closing)
                  ? calculateSales(item.openingStock, item.stockIn, closing)
                  : null;
              return (
                <div
                  key={item.itemId}
                  className="space-y-2 rounded-lg border border-slate-200 p-3"
                >
                  <p className="font-medium text-slate-900">{item.itemName}</p>
                  <p className="text-xs text-slate-500">
                    Open {formatNumber(item.openingStock)} · ADD {formatNumber(item.stockIn)}{" "}
                    · Total {formatNumber(total)}
                    {sales !== null ? ` · Sales ${formatNumber(sales)}` : ""}
                  </p>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={raw}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.itemId]: event.target.value,
                      }))
                    }
                    placeholder="Closing (B.B.F)"
                  />
                </div>
              );
            })}
          </div>

          <p className="text-sm text-slate-500">
            {pendingEntries.length} item{pendingEntries.length === 1 ? "" : "s"} ready to
            close
          </p>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Save closing stock"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
