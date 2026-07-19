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
  price: number;
}

/** @deprecated Prefer `sales` — kept for gradual migration in reports of legacy rows. */
export type InventoryItemLegacy = InventoryItem & { stockOut?: number };

export type StockMovementType = "in" | "close";

/** Legacy transaction type still readable from Sheets. */
export type TransactionType = StockMovementType | "out";

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
  /** For `in`: units added. For `close`/`out`: sales (units sold). */
  quantity: number;
  userEmail: string;
  notes: string;
  /** Legacy stock-out destination; unused for new close rows. */
  destination: string;
  /** Snapshot fields on close rows (blank for stock-in). */
  opening: number | null;
  add: number | null;
  closing: number | null;
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
  itemName?: string;
  category?: string;
  unit?: string;
  openingStock?: number;
  reorderLevel?: number | null;
  notes?: string;
  price?: number;
}

export interface ItemCreateRequest {
  itemName: string;
  category?: string;
  unit?: string;
  openingStock?: number;
  reorderLevel?: number | null;
  notes?: string;
  price?: number;
}

/** True when transaction represents sold units (close or legacy out). */
export function isSalesTransaction(tx: Pick<Transaction, "type">): boolean {
  return tx.type === "close" || tx.type === "out";
}
