import type { InventoryItem } from "./types";

/** Period on-hand before closing count: Opening + ADD. */
export function calculateTotalStock(
  openingStock: number,
  stockIn: number
): number {
  return openingStock + stockIn;
}

/** SALES = (OPEN + ADD) - B.B.F */
export function calculateSales(
  openingStock: number,
  stockIn: number,
  closingStock: number
): number {
  return calculateTotalStock(openingStock, stockIn) - closingStock;
}

/**
 * Legacy formula when stock-out movements were recorded.
 * Prefer calculateSales with entered closing for the new workflow.
 */
export function calculateClosingStock(
  openingStock: number,
  stockIn: number,
  salesOrStockOut: number
): number {
  return openingStock + stockIn - salesOrStockOut;
}

export function parseSheetNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseOptionalNumber(
  value: string | number | undefined
): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** On-hand for alerts: prefer sheet closing; else Opening + Stock In. */
export function onHandStock(item: InventoryItem): number {
  return item.closingStock;
}

export function isLowStock(item: InventoryItem): boolean {
  if (item.reorderLevel === null) return false;
  return onHandStock(item) <= item.reorderLevel;
}

export function isOutOfStock(item: InventoryItem): boolean {
  return onHandStock(item) <= 0;
}

export function validateStockIn(quantity: number): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "Quantity must be greater than zero.";
  }
  return null;
}

export function validateClosingStock(
  item: InventoryItem,
  closingStock: number
): string | null {
  if (!Number.isFinite(closingStock) || closingStock < 0) {
    return "Closing stock must be zero or greater.";
  }
  const total = calculateTotalStock(item.openingStock, item.stockIn);
  if (closingStock > total) {
    return `Closing stock (${closingStock}) cannot exceed total on hand (${total}).`;
  }
  return null;
}

/** @deprecated Use validateStockIn / validateClosingStock. */
export function validateStockMovement(
  item: InventoryItem,
  type: "in" | "out" | "close",
  quantity: number
): string | null {
  if (type === "in") return validateStockIn(quantity);
  if (type === "close") return validateClosingStock(item, quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "Quantity must be greater than zero.";
  }
  if (quantity > item.closingStock) {
    return `Cannot remove ${quantity} ${item.unit}. Only ${item.closingStock} available.`;
  }
  return null;
}
