import {
  filterTransactionsByDateRange,
  resolveReportRange,
  type ReportPeriod,
} from "@/lib/reports";
import { isSalesTransaction } from "@/lib/types";
import type { InventoryItem, Transaction } from "@/lib/types";

export type ProfitRow = {
  itemId: string;
  itemName: string;
  salesQty: number;
  sellPrice: number;
  buyPrice: number;
  revenue: number;
  cost: number;
  profit: number;
};

export type ProfitReport = {
  period: ReportPeriod;
  from: string;
  to: string;
  rows: ProfitRow[];
  totals: {
    salesQty: number;
    revenue: number;
    cost: number;
    profit: number;
  };
};

/**
 * Build profit rows for a date range using live Sheet1 sell/buy prices.
 * Blank buying prices are treated as 0.
 */
export function buildProfitReport(
  items: InventoryItem[],
  transactions: Transaction[],
  from: string,
  to: string
): Omit<ProfitReport, "period"> {
  const filtered = filterTransactionsByDateRange(transactions, from, to);
  const salesById = new Map<string, { itemName: string; salesQty: number }>();

  for (const tx of filtered) {
    if (!isSalesTransaction(tx)) continue;
    const current = salesById.get(tx.itemId) ?? {
      itemName: tx.itemName,
      salesQty: 0,
    };
    current.salesQty += tx.quantity;
    current.itemName = tx.itemName || current.itemName;
    salesById.set(tx.itemId, current);
  }

  const itemById = new Map(items.map((item) => [item.itemId, item]));
  const rows: ProfitRow[] = [];

  // Sheet order first for known items with sales in range
  for (const item of items) {
    const sales = salesById.get(item.itemId);
    if (!sales || sales.salesQty === 0) continue;
    const sellPrice = item.price ?? 0;
    const buyPrice = item.buyingPrice ?? 0;
    const revenue = sales.salesQty * sellPrice;
    const cost = sales.salesQty * buyPrice;
    rows.push({
      itemId: item.itemId,
      itemName: item.itemName,
      salesQty: sales.salesQty,
      sellPrice,
      buyPrice,
      revenue,
      cost,
      profit: revenue - cost,
    });
    salesById.delete(item.itemId);
  }

  // Orphan sales (deleted items) still show with prices 0
  for (const [itemId, sales] of salesById) {
    if (sales.salesQty === 0) continue;
    const item = itemById.get(itemId);
    const sellPrice = item?.price ?? 0;
    const buyPrice = item?.buyingPrice ?? 0;
    const revenue = sales.salesQty * sellPrice;
    const cost = sales.salesQty * buyPrice;
    rows.push({
      itemId,
      itemName: sales.itemName,
      salesQty: sales.salesQty,
      sellPrice,
      buyPrice,
      revenue,
      cost,
      profit: revenue - cost,
    });
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.salesQty += row.salesQty;
      acc.revenue += row.revenue;
      acc.cost += row.cost;
      acc.profit += row.profit;
      return acc;
    },
    { salesQty: 0, revenue: 0, cost: 0, profit: 0 }
  );

  return { from, to, rows, totals };
}

export function resolveProfitRange(params: {
  period: ReportPeriod;
  from?: string | null;
  to?: string | null;
}) {
  return resolveReportRange(params);
}
