import type { InventoryItem, Transaction } from "@/lib/types";
import { isSalesTransaction } from "@/lib/types";

export type RecentCloseRow = {
  itemId: string;
  itemName: string;
  opening: number;
  add: number;
  closing: number;
  sales: number;
  /** True when this item was part of the latest close sync. */
  fromLatestBatch: boolean;
};

export type RecentCloseBatch = {
  closedAt: string | null;
  userEmail: string;
  rows: RecentCloseRow[];
};

function latestCloseTimestamp(transactions: Transaction[]): string | null {
  const closes = transactions.filter((tx) => tx.type === "close" && tx.timestamp);
  if (!closes.length) return null;
  let latest = closes[0].timestamp;
  for (const tx of closes) {
    if (tx.timestamp > latest) latest = tx.timestamp;
  }
  return latest;
}

/**
 * Full catalog for recent close view: every inventory item (sheet order).
 * Items in the latest close batch use transaction snapshots; others use
 * current Sheet1 opening / ADD / closing (sales 0 if not in that batch).
 */
export function buildRecentCloseReport(
  items: InventoryItem[],
  transactions: Transaction[]
): RecentCloseBatch {
  const latest = latestCloseTimestamp(transactions);
  const batchTxs =
    latest == null
      ? []
      : transactions.filter((tx) => tx.type === "close" && tx.timestamp === latest);

  const byId = new Map(
    batchTxs.map((tx) => [
      tx.itemId,
      {
        opening: tx.opening ?? 0,
        add: tx.add ?? 0,
        closing: tx.closing ?? 0,
        sales: isSalesTransaction(tx) ? tx.quantity : 0,
        itemName: tx.itemName,
      },
    ])
  );

  const rows: RecentCloseRow[] = items.map((item) => {
    const fromBatch = byId.get(item.itemId);
    if (fromBatch) {
      return {
        itemId: item.itemId,
        itemName: item.itemName,
        opening: fromBatch.opening,
        add: fromBatch.add,
        closing: fromBatch.closing,
        sales: fromBatch.sales,
        fromLatestBatch: true,
      };
    }
    return {
      itemId: item.itemId,
      itemName: item.itemName,
      opening: item.openingStock,
      add: item.stockIn,
      closing: item.closingStock,
      sales: 0,
      fromLatestBatch: false,
    };
  });

  // Include orphan batch rows not in inventory (deleted items closed this sync)
  for (const tx of batchTxs) {
    if (items.some((i) => i.itemId === tx.itemId)) continue;
    rows.push({
      itemId: tx.itemId,
      itemName: tx.itemName,
      opening: tx.opening ?? 0,
      add: tx.add ?? 0,
      closing: tx.closing ?? 0,
      sales: isSalesTransaction(tx) ? tx.quantity : 0,
      fromLatestBatch: true,
    });
  }

  return {
    closedAt: latest,
    userEmail: batchTxs[0]?.userEmail ?? "",
    rows,
  };
}
