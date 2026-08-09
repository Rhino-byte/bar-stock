export interface InventoryItem {
  rowIndex: number;
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  openingStock: number;
  stockIn: number;
  /** Last period sales (sheet column G; formerly stock out). */
  sales: number;
  closingStock: number;
  reorderLevel: number | null;
  notes: string;
  /** Selling price (Sheet1 col K). */
  price: number;
  /** Cost / buy price (Sheet1 col L); blank sheet cells read as 0. */
  buyingPrice: number;
}

/** @deprecated Prefer `sales` — kept for gradual migration in reports of legacy rows. */
export type InventoryItemLegacy = InventoryItem & { stockOut?: number };

export type StockMovementType = "in" | "close";

/** Legacy `out` still readable; `adjust` / `adjust_stock` for admin corrections. */
export type TransactionType =
  | StockMovementType
  | "out"
  | "adjust"
  | "adjust_stock";

export interface StockMovementRequest {
  itemId: string;
  type: StockMovementType;
  /** Required for stock-in. */
  quantity?: number;
  /** Required for close — physical count (B.B.F). */
  closingStock?: number;
  notes?: string;
}

export interface Transaction {
  timestamp: string;
  itemId: string;
  itemName: string;
  type: TransactionType;
  /**
   * For `in`: units added.
   * For `close`/`out`/`adjust`: sales units (adjust is signed).
   * For `adjust_stock`: on-hand delta (new − old closing).
   */
  quantity: number;
  userEmail: string;
  notes: string;
  /** Legacy stock-out destination; unused for new close rows. */
  destination: string;
  /** Snapshot fields on close/adjust rows (blank for stock-in). */
  opening: number | null;
  add: number | null;
  closing: number | null;
}

export interface CorrectionLogEntry {
  timestamp: string;
  effectiveDate: string;
  kind: "sales" | "stock";
  itemId: string;
  itemName: string;
  salesDelta: number | null;
  stockBefore: number;
  stockAfter: number;
  openingBefore: number;
  openingAfter: number;
  userEmail: string;
  notes: string;
}

export interface AlertLogEntry {
  itemId: string;
  lastAlertedAt: string;
  stockAtAlert: number;
}

export interface DashboardStats {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  todayMovements: number;
}

export interface ItemUpdateRequest {
  itemId: string;
  /** Prefer this when present so duplicate Item IDs still target the right sheet row. */
  rowIndex?: number;
  itemName?: string;
  category?: string;
  unit?: string;
  openingStock?: number;
  reorderLevel?: number | null;
  notes?: string;
  price?: number;
  buyingPrice?: number;
}

export interface ItemCreateRequest {
  itemName: string;
  category?: string;
  unit?: string;
  openingStock?: number;
  reorderLevel?: number | null;
  notes?: string;
  price?: number;
  buyingPrice?: number;
}

export interface ItemDeleteRequest {
  itemId: string;
  rowIndex?: number;
}

/** True when transaction represents sold units (close, legacy out, or sales adjust). */
export function isSalesTransaction(tx: Pick<Transaction, "type">): boolean {
  return tx.type === "close" || tx.type === "out" || tx.type === "adjust";
}
