"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { fetchInventory, submitClosingStockBatch } from "@/lib/api-client";
import {
  clearClosingDraft,
  countFilledDrafts,
  loadClosingDraft,
  saveClosingDraft,
  type ClosingDraftMap,
} from "@/lib/closing-draft-storage";
import { todayDateKey } from "@/lib/dates";
import { calculateSales, calculateTotalStock } from "@/lib/stock";
import { formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";

export function ClosingStockForm() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<ClosingDraftMap>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [online, setOnline] = useState(true);
  const draftsRef = useRef(drafts);
  const submittingRef = useRef(false);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    function handleOnline() {
      setOnline(true);
      toast.message("Back online. You can sync remaining closing counts.");
    }
    function handleOffline() {
      setOnline(false);
      toast.message("You’re offline. Counts keep saving on this phone.");
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const today = todayDateKey();
    const cached = loadClosingDraft(today);

    fetchInventory()
      .then((list) => {
        setItems(list);
        const initial: ClosingDraftMap = {};
        for (const item of list) {
          initial[item.itemId] = cached?.drafts[item.itemId] ?? "";
        }
        // Keep orphan draft keys if item ids changed mid-day (still show in pending count via storage)
        if (cached?.drafts) {
          for (const [itemId, value] of Object.entries(cached.drafts)) {
            if (!(itemId in initial)) {
              initial[itemId] = value;
            }
          }
        }
        setDrafts(initial);
        if (cached && countFilledDrafts(cached.drafts) > 0) {
          setRestoredFromCache(true);
          setDraftSavedAt(cached.updatedAt);
          toast.success(
            `Restored ${countFilledDrafts(cached.drafts)} unsynced closing count(s) from this phone.`
          );
        }
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load inventory")
      )
      .finally(() => setLoading(false));
  }, []);

  // Autosave drafts whenever they change (after initial load).
  useEffect(() => {
    if (loading) return;
    saveClosingDraft(drafts);
    const filled = countFilledDrafts(drafts);
    if (filled === 0) {
      setDraftSavedAt(null);
      setRestoredFromCache(false);
    } else {
      setDraftSavedAt(new Date().toISOString());
    }
  }, [drafts, loading]);

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

  const filledCount = countFilledDrafts(drafts);

  const syncPending = useCallback(async () => {
    if (submittingRef.current) return;
    if (!navigator.onLine) {
      toast.error("You’re offline. Counts are saved on this phone — sync when connected.");
      return;
    }

    const currentDrafts = draftsRef.current;
    const entries = items
      .map((item) => {
        const raw = currentDrafts[item.itemId]?.trim() ?? "";
        if (raw === "") return null;
        const closing = Number(raw);
        if (!Number.isFinite(closing) || closing < 0) return null;
        const total = calculateTotalStock(item.openingStock, item.stockIn);
        const sales = calculateSales(item.openingStock, item.stockIn, closing);
        return { item, closing, total, sales };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (!entries.length) {
      toast.error("Enter closing stock for at least one item.");
      return;
    }

    for (const entry of entries) {
      if (entry.closing > entry.total) {
        toast.error(
          `${entry.item.itemName}: closing (${entry.closing}) exceeds total (${entry.total}).`
        );
        return;
      }
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await submitClosingStockBatch(
        entries.map((entry) => ({
          itemId: entry.item.itemId,
          closingStock: entry.closing,
        }))
      );

      const updatedById = new Map(result.items.map((item) => [item.itemId, item]));
      setItems((current) =>
        current.map((item) => updatedById.get(item.itemId) ?? item)
      );

      const remainingDrafts = { ...draftsRef.current };
      for (const entry of entries) {
        remainingDrafts[entry.item.itemId] = "";
      }
      draftsRef.current = remainingDrafts;
      setDrafts(remainingDrafts);
      if (countFilledDrafts(remainingDrafts) === 0) {
        clearClosingDraft();
      } else {
        saveClosingDraft(remainingDrafts);
      }

      toast.success(
        `Closing stock saved for ${result.count} item${result.count === 1 ? "" : "s"}. Period rolled.`
      );
      setRestoredFromCache(false);
    } catch (error) {
      saveClosingDraft(draftsRef.current);
      toast.error(
        error instanceof Error
          ? error.message
          : "Closing stock sync failed. Counts are still cached on this phone."
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [items]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await syncPending();
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">Loading inventory…</CardContent>
      </Card>
    );
  }

  const statusParts: string[] = [];
  if (!online) {
    statusParts.push("Offline — counts save on this phone only");
  } else if (filledCount > 0) {
    statusParts.push(
      `${filledCount} unsynced count${filledCount === 1 ? "" : "s"} cached on this phone`
    );
  } else {
    statusParts.push("All synced — no local draft");
  }
  if (draftSavedAt && filledCount > 0) {
    try {
      statusParts.push(`last saved ${new Date(draftSavedAt).toLocaleTimeString()}`);
    } catch {
      // ignore
    }
  }
  if (restoredFromCache && filledCount > 0) {
    statusParts.push("restored after reload");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closing Stock (B.B.F)</CardTitle>
        <CardDescription>
          Enter the physical count remaining. Sales = (Opening + ADD) − Closing. Saving
          rolls Opening to Closing and resets ADD. Drafts autosave on this phone if the
          network drops.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              online
                ? filledCount > 0
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {statusParts.join(" · ")}
          </div>

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
            sync
          </p>

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || pendingEntries.length === 0}
          >
            {submitting
              ? "Syncing…"
              : !online
                ? "Offline — open to sync later"
                : "Save closing stock"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
