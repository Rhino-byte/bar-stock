import { google } from "googleapis";
import {
  calculateSales,
  calculateTotalStock,
  parseOptionalNumber,
  parseSheetNumber,
} from "./stock";
import type {
  AlertLogEntry,
  InventoryItem,
  ItemCreateRequest,
  ItemUpdateRequest,
  Transaction,
  TransactionType,
} from "./types";

const INVENTORY_SHEET = "Sheet1";
const TRANSACTIONS_SHEET = "Transactions";
const ALERT_LOG_SHEET = "AlertLog";

const INVENTORY_HEADERS = [
  "Item ID",
  "Item Name",
  "Category",
  "Unit",
  "Opening Stock",
  "Stock In",
  "Sales",
  "Closing Stock",
  "Reorder Level",
  "Notes",
  "Price",
] as const;

const TRANSACTION_HEADERS = [
  "Timestamp",
  "Item ID",
  "Item Name",
  "Type",
  "Quantity",
  "User Email",
  "Notes",
  "Destination",
  "Opening",
  "Add",
  "Closing",
] as const;

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
  }
  return id;
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  if (!email || !key) {
    throw new Error("Google service account credentials are not configured.");
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function rowToItem(row: string[], rowIndex: number): InventoryItem | null {
  const itemId = row[0]?.trim();
  const itemName = row[1]?.trim();
  if (!itemId || !itemName) return null;

  const openingStock = parseSheetNumber(row[4]);
  const stockIn = parseSheetNumber(row[5]);
  const sales = parseSheetNumber(row[6]);
  const closingFromSheet = parseOptionalNumber(row[7]);
  const closingStock =
    closingFromSheet ?? calculateTotalStock(openingStock, stockIn);

  return {
    rowIndex,
    itemId,
    itemName,
    category: row[2]?.trim() ?? "",
    unit: row[3]?.trim() ?? "",
    openingStock,
    stockIn,
    sales,
    closingStock,
    reorderLevel: parseOptionalNumber(row[8]),
    notes: row[9]?.trim() ?? "",
    price: parseSheetNumber(row[10]),
  };
}

function itemToRowValues(item: Omit<InventoryItem, "rowIndex">): (string | number)[] {
  return [
    item.itemId,
    item.itemName,
    item.category,
    item.unit,
    item.openingStock,
    item.stockIn,
    item.sales,
    item.closingStock,
    item.reorderLevel ?? "",
    item.notes,
    item.price,
  ];
}

export async function ensureAuxiliarySheets(): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Set(
    meta.data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean)
  );

  const requests: Array<{ addSheet: { properties: { title: string } } }> = [];

  if (!existing.has(TRANSACTIONS_SHEET)) {
    requests.push({
      addSheet: { properties: { title: TRANSACTIONS_SHEET } },
    });
  }

  if (!existing.has(ALERT_LOG_SHEET)) {
    requests.push({
      addSheet: { properties: { title: ALERT_LOG_SHEET } },
    });
  }

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  if (!existing.has(TRANSACTIONS_SHEET)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TRANSACTIONS_SHEET}!A1:K1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[...TRANSACTION_HEADERS]],
      },
    });
  } else {
    await ensureTransactionsExtendedColumns(sheets, spreadsheetId);
  }

  if (!existing.has(ALERT_LOG_SHEET)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${ALERT_LOG_SHEET}!A1:C1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Item ID", "Last Alerted At", "Stock At Alert"]],
      },
    });
  }

  await ensureInventoryHeaders(sheets, spreadsheetId);
}

async function ensureInventoryHeaders(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string
): Promise<void> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${INVENTORY_SHEET}!A1:K1`,
  });
  const header = [...(response.data.values?.[0] ?? [])];
  while (header.length < 11) {
    header.push("");
  }
  let changed = false;
  for (let i = 0; i < INVENTORY_HEADERS.length; i++) {
    if (header[i] !== INVENTORY_HEADERS[i]) {
      // Keep legacy "Stock Out" label readable but prefer Sales for new installs
      if (i === 6 && header[i]?.trim() === "Stock Out") {
        header[i] = "Sales";
        changed = true;
      } else if (!header[i]?.trim()) {
        header[i] = INVENTORY_HEADERS[i];
        changed = true;
      } else if (i === 10 && header[i]?.trim() !== "Price") {
        header[i] = "Price";
        changed = true;
      }
    }
  }
  if (header[10]?.trim() !== "Price") {
    header[10] = "Price";
    changed = true;
  }
  if (changed) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${INVENTORY_SHEET}!A1:K1`,
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
  }
}

async function ensureTransactionsExtendedColumns(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string
): Promise<void> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TRANSACTIONS_SHEET}!A1:K`,
  });

  const rows = response.data.values ?? [];
  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TRANSACTIONS_SHEET}!A1:K1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[...TRANSACTION_HEADERS]],
      },
    });
    return;
  }

  const header = [...(rows[0] ?? [])];
  while (header.length < 11) {
    header.push("");
  }
  let headerChanged = false;
  for (let i = 0; i < TRANSACTION_HEADERS.length; i++) {
    if (header[i]?.trim() !== TRANSACTION_HEADERS[i]) {
      if (!header[i]?.trim() || i >= 8) {
        header[i] = TRANSACTION_HEADERS[i];
        headerChanged = true;
      }
    }
  }
  if (headerChanged) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TRANSACTIONS_SHEET}!A1:K1`,
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
  }
}

export async function getInventoryItems(): Promise<InventoryItem[]> {
  await ensureAuxiliarySheets();
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${INVENTORY_SHEET}!A2:K`,
  });

  const rows = response.data.values ?? [];
  return rows
    .map((row, index) => rowToItem(row, index + 2))
    .filter((item): item is InventoryItem => item !== null);
}

export async function getInventoryItemById(
  itemId: string
): Promise<InventoryItem | null> {
  const items = await getInventoryItems();
  return items.find((item) => item.itemId === itemId) ?? null;
}

export async function updateStockIn(
  item: InventoryItem,
  quantity: number
): Promise<InventoryItem> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const stockIn = item.stockIn + quantity;
  const closingStock = calculateTotalStock(item.openingStock, stockIn);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${INVENTORY_SHEET}!F${item.rowIndex}:H${item.rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[stockIn, item.sales, closingStock]],
    },
  });

  return {
    ...item,
    stockIn,
    closingStock,
  };
}

/**
 * Record closing stock (B.B.F), compute sales, auto-roll opening.
 */
export async function applyClosingStock(
  item: InventoryItem,
  closingEntered: number
): Promise<{ item: InventoryItem; sales: number }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const sales = calculateSales(
    item.openingStock,
    item.stockIn,
    closingEntered
  );

  const nextItem: InventoryItem = {
    ...item,
    openingStock: closingEntered,
    stockIn: 0,
    sales,
    closingStock: closingEntered,
  };

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${INVENTORY_SHEET}!E${item.rowIndex}:H${item.rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          nextItem.openingStock,
          nextItem.stockIn,
          nextItem.sales,
          nextItem.closingStock,
        ],
      ],
    },
  });

  return { item: nextItem, sales };
}

/** @deprecated Prefer updateStockIn / applyClosingStock */
export async function updateStockMovement(
  item: InventoryItem,
  type: "in" | "out",
  quantity: number
): Promise<InventoryItem> {
  if (type === "in") {
    return updateStockIn(item, quantity);
  }
  const { item: next } = await applyClosingStock(
    item,
    calculateTotalStock(item.openingStock, item.stockIn) - quantity
  );
  return next;
}

export async function appendTransaction(transaction: Transaction): Promise<void> {
  await ensureAuxiliarySheets();
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${TRANSACTIONS_SHEET}!A:K`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          transaction.timestamp,
          transaction.itemId,
          transaction.itemName,
          transaction.type,
          transaction.quantity,
          transaction.userEmail,
          transaction.notes,
          transaction.destination,
          transaction.opening ?? "",
          transaction.add ?? "",
          transaction.closing ?? "",
        ],
      ],
    },
  });
}

function parseTransactionType(raw: string): TransactionType {
  const value = raw.trim().toLowerCase();
  if (value === "out") return "out";
  if (value === "close") return "close";
  return "in";
}

export async function getTransactions(): Promise<Transaction[]> {
  await ensureAuxiliarySheets();
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${TRANSACTIONS_SHEET}!A2:K`,
  });

  const rows = response.data.values ?? [];
  return rows.map((row) => {
    const type = parseTransactionType(String(row[3] ?? ""));
    return {
      timestamp: row[0] ?? "",
      itemId: row[1] ?? "",
      itemName: row[2] ?? "",
      type,
      quantity: parseSheetNumber(row[4]),
      userEmail: row[5] ?? "",
      notes: row[6] ?? "",
      destination: row[7]?.trim() ?? "",
      opening: row[8] === undefined || row[8] === "" ? null : parseSheetNumber(row[8]),
      add: row[9] === undefined || row[9] === "" ? null : parseSheetNumber(row[9]),
      closing: row[10] === undefined || row[10] === "" ? null : parseSheetNumber(row[10]),
    };
  });
}

export async function updateItemMetadata(
  update: ItemUpdateRequest
): Promise<InventoryItem> {
  const item = await getInventoryItemById(update.itemId);
  if (!item) {
    throw new Error("Item not found.");
  }

  const nextItem: InventoryItem = {
    ...item,
    itemName: update.itemName ?? item.itemName,
    category: update.category ?? item.category,
    unit: update.unit ?? item.unit,
    openingStock: update.openingStock ?? item.openingStock,
    reorderLevel:
      update.reorderLevel !== undefined ? update.reorderLevel : item.reorderLevel,
    notes: update.notes ?? item.notes,
    price: update.price !== undefined ? update.price : item.price,
  };

  nextItem.closingStock = calculateTotalStock(
    nextItem.openingStock,
    nextItem.stockIn
  );

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `${INVENTORY_SHEET}!A${item.rowIndex}:K${item.rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [itemToRowValues(nextItem)],
    },
  });

  return { ...nextItem, rowIndex: item.rowIndex };
}

export async function createInventoryItem(
  input: ItemCreateRequest
): Promise<InventoryItem> {
  await ensureAuxiliarySheets();
  const items = await getInventoryItems();
  const nextNum = items.length + 1;
  const itemId = `MM-${String(nextNum).padStart(3, "0")}`;
  const openingStock = input.openingStock ?? 0;
  const price = input.price ?? 0;

  const newItem: Omit<InventoryItem, "rowIndex"> = {
    itemId,
    itemName: input.itemName.trim(),
    category: input.category?.trim() ?? "",
    unit: input.unit?.trim() ?? "pcs",
    openingStock,
    stockIn: 0,
    sales: 0,
    closingStock: openingStock,
    reorderLevel: input.reorderLevel ?? null,
    notes: input.notes?.trim() ?? "",
    price,
  };

  if (!newItem.itemName) {
    throw new Error("Item name is required.");
  }

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${INVENTORY_SHEET}!A:K`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [itemToRowValues(newItem)],
    },
  });

  const created = await getInventoryItemById(itemId);
  if (!created) {
    throw new Error("Failed to create item.");
  }
  return created;
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  const item = await getInventoryItemById(itemId);
  if (!item) {
    throw new Error("Item not found.");
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === INVENTORY_SHEET
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error("Inventory sheet not found.");
  }

  // rowIndex is 1-based sheet row; delete that row (0-based start/end exclusive end)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: item.rowIndex - 1,
              endIndex: item.rowIndex,
            },
          },
        },
      ],
    },
  });
}

/** Replace all inventory data rows with the provided catalog entries. */
export async function replaceInventoryCatalog(
  catalog: Array<{ itemName: string; price: number }>
): Promise<InventoryItem[]> {
  await ensureAuxiliarySheets();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const existing = await getInventoryItems();
  if (existing.length > 0) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets?.find(
      (s) => s.properties?.title === INVENTORY_SHEET
    );
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) {
      throw new Error("Inventory sheet not found.");
    }
    const lastRow = existing[existing.length - 1].rowIndex;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: 1,
                endIndex: lastRow,
              },
            },
          },
        ],
      },
    });
  }

  const rows = catalog.map((entry, index) => {
    const itemId = `MM-${String(index + 1).padStart(3, "0")}`;
    return itemToRowValues({
      itemId,
      itemName: entry.itemName,
      category: "",
      unit: "pcs",
      openingStock: 0,
      stockIn: 0,
      sales: 0,
      closingStock: 0,
      reorderLevel: null,
      notes: "",
      price: entry.price,
    });
  });

  if (rows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${INVENTORY_SHEET}!A2:K${rows.length + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
  }

  return getInventoryItems();
}

export async function getAlertLogs(): Promise<AlertLogEntry[]> {
  await ensureAuxiliarySheets();
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${ALERT_LOG_SHEET}!A2:C`,
  });

  const rows = response.data.values ?? [];
  return rows.map((row) => ({
    itemId: row[0] ?? "",
    lastAlertedAt: row[1] ?? "",
    stockAtAlert: parseSheetNumber(row[2]),
  }));
}

export async function upsertAlertLog(entry: AlertLogEntry): Promise<void> {
  await ensureAuxiliarySheets();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const logs = await getAlertLogs();
  const existingIndex = logs.findIndex((log) => log.itemId === entry.itemId);

  if (existingIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${ALERT_LOG_SHEET}!A:C`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[entry.itemId, entry.lastAlertedAt, entry.stockAtAlert]],
      },
    });
    return;
  }

  const rowIndex = existingIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${ALERT_LOG_SHEET}!A${rowIndex}:C${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[entry.itemId, entry.lastAlertedAt, entry.stockAtAlert]],
    },
  });
}
