import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  isDateKeyInRange,
  rollingDateRange,
  todayDateKey,
  transactionDateKey,
} from "@/lib/dates";
import { isSalesTransaction } from "@/lib/types";
import type { InventoryItem, Transaction } from "@/lib/types";

export type ReportPeriod = "weekly" | "monthly" | "4months" | "custom";

export const REPORT_PERIOD_DAYS: Record<Exclude<ReportPeriod, "custom">, number> = {
  weekly: 7,
  monthly: 30,
  "4months": 120,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_RANGE_DAYS = 366 * 2;

export { todayDateKey };

export function isValidDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

/** Inclusive rolling window: from = today - (days - 1), to = today. */
export function presetDateRange(
  days: number,
  now = new Date()
): { from: string; to: string } {
  return rollingDateRange(days, now);
}

export function filterTransactionsByDateRange(
  transactions: Transaction[],
  fromKey: string,
  toKey: string
): Transaction[] {
  return transactions.filter((tx) => {
    const day = transactionDateKey(tx.timestamp);
    return isDateKeyInRange(day, fromKey, toKey);
  });
}

export function resolveReportRange(params: {
  period: ReportPeriod;
  from?: string | null;
  to?: string | null;
}): { from: string; to: string } | { error: string } {
  if (params.period === "custom") {
    const from = params.from?.trim() ?? "";
    const to = params.to?.trim() ?? "";
    if (!from || !to) {
      return { error: "Custom period requires from and to dates (YYYY-MM-DD)." };
    }
    if (!isValidDateKey(from) || !isValidDateKey(to)) {
      return { error: "Invalid date. Use YYYY-MM-DD." };
    }
    if (from > to) {
      return { error: "From date must be on or before the to date." };
    }
    const span = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
    if (span > MAX_CUSTOM_RANGE_DAYS) {
      return { error: "Custom range cannot exceed 2 years." };
    }
    return { from, to };
  }

  const days = REPORT_PERIOD_DAYS[params.period];
  return presetDateRange(days);
}

export type ReportStockInRow = {
  itemId: string;
  itemName: string;
  stockIn: number;
};

/** Merry Mary sales ledger row. */
export type ReportSalesLedgerRow = {
  itemId: string;
  itemName: string;
  open: number;
  add: number;
  total: number;
  bbf: number;
  sales: number;
  price: number;
  amount: number;
};

export function reportStockInTotals(transactions: Transaction[]): ReportStockInRow[] {
  const totals = new Map<string, { itemName: string; stockIn: number }>();
  for (const tx of transactions) {
    if (tx.type !== "in") continue;
    const current = totals.get(tx.itemId) ?? { itemName: tx.itemName, stockIn: 0 };
    current.stockIn += tx.quantity;
    totals.set(tx.itemId, current);
  }
  return Array.from(totals.entries())
    .map(([itemId, values]) => ({
      itemId,
      itemName: values.itemName,
      stockIn: values.stockIn,
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

/**
 * Build Merry Mary sales ledger for a date range.
 * Prefers close-transaction snapshots (Opening/Add/Closing).
 * Falls back to aggregating in + sales (close/out) when snapshots are missing.
 */
export function reportSalesLedgerRows(
  items: InventoryItem[],
  allTransactions: Transaction[],
  fromKey: string,
  toKey: string
): ReportSalesLedgerRow[] {
  const priceById = new Map(items.map((item) => [item.itemId, item.price]));
  const nameById = new Map(items.map((item) => [item.itemId, item.itemName]));

  const periodTx = filterTransactionsByDateRange(allTransactions, fromKey, toKey);

  type Acc = {
    itemName: string;
    open: number;
    add: number;
    bbf: number;
    sales: number;
    closeCount: number;
    hasSnapshot: boolean;
  };

  const byItem = new Map<string, Acc>();

  function ensure(itemId: string, itemName: string): Acc {
    let acc = byItem.get(itemId);
    if (!acc) {
      acc = {
        itemName,
        open: 0,
        add: 0,
        bbf: 0,
        sales: 0,
        closeCount: 0,
        hasSnapshot: false,
      };
      byItem.set(itemId, acc);
    }
    return acc;
  }

  for (const tx of periodTx) {
    if (!tx.itemId) continue;
    const acc = ensure(tx.itemId, tx.itemName || nameById.get(tx.itemId) || tx.itemId);

    if (tx.type === "in") {
      acc.add += tx.quantity;
      continue;
    }

    if (!isSalesTransaction(tx)) continue;

    acc.sales += tx.quantity;
    acc.closeCount += 1;

    if (tx.type === "close" && tx.opening !== null && tx.closing !== null) {
      if (!acc.hasSnapshot) {
        acc.open = tx.opening;
        acc.hasSnapshot = true;
      }
      // Last close in chronological order wins for B.B.F
      acc.bbf = tx.closing;
      if (tx.add !== null) {
        // Prefer sum of adds from in txs; if no ins, use snapshot adds
      }
    }
  }

  // Second pass: for items with close snapshots, if add from ins is 0 but
  // snapshots have add, use sum of close.add values when no in txs.
  const closeTxs = periodTx
    .filter((tx) => tx.type === "close")
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const tx of closeTxs) {
    const acc = byItem.get(tx.itemId);
    if (!acc || tx.opening === null || tx.closing === null) continue;
    if (acc.closeCount === 1) {
      acc.open = tx.opening;
      if (acc.add === 0 && tx.add !== null) {
        acc.add = tx.add;
      }
      acc.bbf = tx.closing;
      acc.hasSnapshot = true;
    } else {
      // Multiple closes: first open, last bbf; add already from ins (or sum snapshot adds)
      const first = closeTxs.find((c) => c.itemId === tx.itemId);
      const lasts = closeTxs.filter((c) => c.itemId === tx.itemId);
      const last = lasts[lasts.length - 1];
      if (first?.opening !== null && first?.opening !== undefined) {
        acc.open = first.opening;
      }
      if (last?.closing !== null && last?.closing !== undefined) {
        acc.bbf = last.closing;
      }
      if (acc.add === 0) {
        acc.add = lasts.reduce((sum, c) => sum + (c.add ?? 0), 0);
      }
      acc.hasSnapshot = true;
    }
  }

  // Items with only stock-in in period (no close yet)
  for (const item of items) {
    const acc = byItem.get(item.itemId);
    if (!acc) continue;
    if (!acc.hasSnapshot && acc.sales === 0) {
      // Opening unknown for pure add period — use 0 open, show add only
      acc.bbf = acc.open + acc.add;
    } else if (!acc.hasSnapshot && acc.sales > 0) {
      // Legacy out without snapshot: derive open from sheet prior math isn't available;
      // show sales and add; total = sales (treat open+add-bbf as sales-focused)
      acc.open = 0;
      acc.bbf = Math.max(0, acc.add - acc.sales);
    }
  }

  const rows: ReportSalesLedgerRow[] = [];

  // Include all catalog items so the printout matches the paper sheet layout
  for (const item of items) {
    const acc = byItem.get(item.itemId);
    const open = acc?.open ?? 0;
    const add = acc?.add ?? 0;
    const sales = acc?.sales ?? 0;
    let bbf = acc?.bbf ?? 0;
    if (!acc) {
      // No activity — still list with zeros
      bbf = 0;
    } else if (!acc.hasSnapshot && sales === 0 && add > 0) {
      bbf = open + add;
    } else if (!acc.hasSnapshot && sales > 0) {
      bbf = Math.max(0, open + add - sales);
    }

    const total = open + add;
    const price = priceById.get(item.itemId) ?? item.price;
    const computedSales = acc?.hasSnapshot ? sales : total - bbf;
    const finalSales = acc ? (acc.hasSnapshot ? sales : computedSales) : 0;
    const finalBbf = acc ? bbf : 0;
    const finalOpen = acc ? open : 0;
    const finalAdd = acc ? add : 0;
    const finalTotal = finalOpen + finalAdd;

    rows.push({
      itemId: item.itemId,
      itemName: item.itemName,
      open: finalOpen,
      add: finalAdd,
      total: finalTotal,
      bbf: finalBbf,
      sales: finalSales,
      price,
      amount: finalSales * price,
    });
  }

  // Also include orphan txs for deleted items
  for (const [itemId, acc] of byItem) {
    if (items.some((i) => i.itemId === itemId)) continue;
    const open = acc.open;
    const add = acc.add;
    const total = open + add;
    const bbf = acc.hasSnapshot ? acc.bbf : Math.max(0, total - acc.sales);
    const sales = acc.hasSnapshot ? acc.sales : total - bbf;
    const price = priceById.get(itemId) ?? 0;
    rows.push({
      itemId,
      itemName: acc.itemName,
      open,
      add,
      total,
      bbf,
      sales,
      price,
      amount: sales * price,
    });
  }

  return rows.sort((a, b) => {
    const aActive = a.add !== 0 || a.sales !== 0 || a.open !== 0 || a.bbf !== 0;
    const bActive = b.add !== 0 || b.sales !== 0 || b.open !== 0 || b.bbf !== 0;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return a.itemName.localeCompare(b.itemName);
  });
}
