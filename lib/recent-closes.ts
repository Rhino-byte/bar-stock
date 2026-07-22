import { isSalesTransaction, type Transaction } from "@/lib/types";

export type RecentCloseRow = {
  itemId: string;
  itemName: string;
  opening: number;
  add: number;
  closing: number;
  sales: number;
};

export type RecentCloseBatch = {
  closedAt: string;
  userEmail: string;
  rows: RecentCloseRow[];
};

/** Latest close batch: all close txs sharing the max timestamp. */
export function getLatestCloseBatch(
  transactions: Transaction[]
): RecentCloseBatch | null {
  const closes = transactions.filter((tx) => tx.type === "close" && tx.timestamp);
  if (!closes.length) return null;

  let latest = closes[0].timestamp;
  for (const tx of closes) {
    if (tx.timestamp > latest) latest = tx.timestamp;
  }

  const batch = closes.filter((tx) => tx.timestamp === latest);
  const rows: RecentCloseRow[] = batch
    .map((tx) => ({
      itemId: tx.itemId,
      itemName: tx.itemName,
      opening: tx.opening ?? 0,
      add: tx.add ?? 0,
      closing: tx.closing ?? 0,
      sales: isSalesTransaction(tx) ? tx.quantity : 0,
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  return {
    closedAt: latest,
    userEmail: batch[0]?.userEmail ?? "",
    rows,
  };
}
