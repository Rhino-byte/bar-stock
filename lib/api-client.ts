import type { DailyStockItem } from "@/lib/analytics";
import type { InventoryItem } from "@/lib/types";
import { getFirebaseAuthHeader } from "@/lib/auth/use-firebase-auth";

export async function fetchInventory(): Promise<InventoryItem[]> {
  const headers = await getFirebaseAuthHeader();
  const response = await fetch("/api/inventory", { headers, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load inventory");
  }
  return data.items;
}

export async function submitStockMovement(payload: {
  itemId: string;
  type: "in";
  quantity: number;
  notes?: string;
}) {
  const headers = await getFirebaseAuthHeader();
  const response = await fetch("/api/stock", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to update stock");
  }
  return data as { item: InventoryItem };
}

export async function submitClosingStock(payload: {
  itemId: string;
  closingStock: number;
  notes?: string;
}) {
  const headers = await getFirebaseAuthHeader();
  const response = await fetch("/api/stock", {
    method: "POST",
    headers,
    body: JSON.stringify({
      itemId: payload.itemId,
      type: "close",
      closingStock: payload.closingStock,
      notes: payload.notes,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to save closing stock");
  }
  return data as { item: InventoryItem; sales: number; amount: number };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sync many closing counts in one server request (few Sheets API calls). */
export async function submitClosingStockBatch(
  entries: Array<{ itemId: string; closingStock: number; notes?: string }>
) {
  const headers = await getFirebaseAuthHeader();
  let attempt = 0;
  const maxAttempts = 4;

  while (true) {
    attempt += 1;
    const response = await fetch("/api/stock/close-batch", {
      method: "POST",
      headers,
      body: JSON.stringify({ entries }),
    });
    const data = await response.json();

    if (response.ok) {
      return data as {
        count: number;
        results: Array<{ item: InventoryItem; sales: number; amount: number }>;
        items: InventoryItem[];
      };
    }

    const message = data.error ?? "Failed to save closing stock batch";
    const retryable =
      response.status === 429 ||
      /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(String(message));

    if (!retryable || attempt >= maxAttempts) {
      throw new Error(message);
    }

    const delayMs = Math.min(8000, 1000 * 2 ** (attempt - 1));
    await sleep(delayMs);
  }
}

export async function fetchDailyStock(date?: string): Promise<{
  date: string;
  items: DailyStockItem[];
}> {
  const headers = await getFirebaseAuthHeader();
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(`/api/daily-stock${query}`, {
    headers,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load daily stock");
  }
  return data;
}

export async function fetchReport(params: {
  period: "weekly" | "monthly" | "4months" | "custom";
  from?: string;
  to?: string;
}) {
  const headers = await getFirebaseAuthHeader();
  const search = new URLSearchParams({ period: params.period });
  if (params.period === "custom") {
    if (params.from) search.set("from", params.from);
    if (params.to) search.set("to", params.to);
  }
  const response = await fetch(`/api/reports?${search.toString()}`, {
    headers,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load report");
  }
  return data;
}

export async function fetchAnalytics(days: number, headers: HeadersInit) {
  const response = await fetch(`/api/analytics?days=${days}`, {
    headers,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load analytics");
  }
  return data;
}

export async function updateItem(
  payload: Record<string, unknown>,
  headers: HeadersInit
) {
  const response = await fetch("/api/items", {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to update item");
  }
  return data.item as InventoryItem;
}

export async function createItem(
  payload: Record<string, unknown>,
  headers: HeadersInit
) {
  const response = await fetch("/api/items", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to create item");
  }
  return data.item as InventoryItem;
}

export async function deleteItem(
  itemId: string,
  headers: HeadersInit,
  rowIndex?: number
) {
  const response = await fetch("/api/items", {
    method: "DELETE",
    headers,
    body: JSON.stringify({ itemId, rowIndex }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to delete item");
  }
  return data;
}

export async function repairDuplicateItemIds(headers: HeadersInit) {
  const response = await fetch("/api/items/repair-ids", {
    method: "POST",
    headers,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to repair duplicate IDs");
  }
  return data as {
    items: InventoryItem[];
    repaired: Array<{
      rowIndex: number;
      from: string;
      to: string;
      itemName: string;
    }>;
    count: number;
  };
}

export async function seedMerryMaryCatalog(headers: HeadersInit) {
  const response = await fetch("/api/items/seed", {
    method: "POST",
    headers,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load catalog");
  }
  return data as { items: InventoryItem[]; count: number };
}

export async function sendTestAlert(headers: HeadersInit) {
  const response = await fetch("/api/alerts/test", {
    method: "POST",
    headers,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to send test alert");
  }
  return data;
}

export async function fetchRecentCloses() {
  const headers = await getFirebaseAuthHeader();
  const response = await fetch("/api/recent-closes", {
    headers,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load recent closes");
  }
  return data as {
    closedAt: string | null;
    userEmail: string;
    rows: Array<{
      itemId: string;
      itemName: string;
      opening: number;
      add: number;
      closing: number;
      sales: number;
    }>;
  };
}
