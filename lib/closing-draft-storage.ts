import { todayDateKey } from "@/lib/dates";

const STORAGE_KEY = "merry-mary:closing-stock-draft";

export type ClosingDraftMap = Record<string, string>;

export type ClosingDraftStore = {
  date: string;
  updatedAt: string;
  drafts: ClosingDraftMap;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadClosingDraft(date = todayDateKey()): ClosingDraftStore | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClosingDraftStore;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.date !== date) return null;
    if (!parsed.drafts || typeof parsed.drafts !== "object") return null;
    return {
      date: parsed.date,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      drafts: parsed.drafts,
    };
  } catch {
    return null;
  }
}

export function saveClosingDraft(
  drafts: ClosingDraftMap,
  date = todayDateKey()
): void {
  if (!canUseStorage()) return;
  try {
    const filled: ClosingDraftMap = {};
    for (const [itemId, value] of Object.entries(drafts)) {
      const trimmed = value.trim();
      if (trimmed !== "") {
        filled[itemId] = value;
      }
    }
    if (Object.keys(filled).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: ClosingDraftStore = {
      date,
      updatedAt: new Date().toISOString(),
      drafts: filled,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore; in-memory drafts still work.
  }
}

export function clearClosingDraft(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function countFilledDrafts(drafts: ClosingDraftMap): number {
  return Object.values(drafts).filter((value) => value.trim() !== "").length;
}
