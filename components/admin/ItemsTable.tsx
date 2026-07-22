"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createItem,
  deleteItem,
  repairDuplicateItemIds,
  seedMerryMaryCatalog,
  updateItem,
} from "@/lib/api-client";
import { getFirebaseAuthHeader } from "@/lib/auth/use-firebase-auth";
import { formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/lib/types";

interface ItemsTableProps {
  initialItems: InventoryItem[];
}

const EMPTY_CREATE = {
  itemName: "",
  category: "",
  unit: "pcs",
  openingStock: "0",
  price: "0",
  reorderLevel: "",
  notes: "",
};

export function ItemsTable({ initialItems }: ItemsTableProps) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [savingRow, setSavingRow] = useState<number | null>(null);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (item) =>
        item.itemName.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
    );
  }, [items, search]);

  const isFiltering = search.trim().length > 0;

  async function saveItem(item: InventoryItem) {
    setSavingRow(item.rowIndex);
    try {
      const headers = await getFirebaseAuthHeader();
      const updated = await updateItem(
        {
          itemId: item.itemId,
          rowIndex: item.rowIndex,
          itemName: item.itemName,
          category: item.category,
          unit: item.unit,
          openingStock: item.openingStock,
          reorderLevel: item.reorderLevel,
          notes: item.notes,
          price: item.price,
        },
        headers
      );
      setItems((current) =>
        current.map((row) =>
          row.rowIndex === updated.rowIndex ? updated : row
        )
      );
      toast.success(`${updated.itemName} updated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setSavingRow(null);
    }
  }

  async function handleDelete(item: InventoryItem) {
    if (
      !window.confirm(
        `Delete "${item.itemName}"? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingRow(item.rowIndex);
    try {
      const headers = await getFirebaseAuthHeader();
      await deleteItem(item.itemId, headers, item.rowIndex);
      setItems((current) =>
        current
          .filter((row) => row.rowIndex !== item.rowIndex)
          .map((row) =>
            row.rowIndex > item.rowIndex
              ? { ...row, rowIndex: row.rowIndex - 1 }
              : row
          )
      );
      toast.success(`${item.itemName} deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingRow(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!createForm.itemName.trim()) {
      toast.error("Item name is required.");
      return;
    }
    setCreating(true);
    try {
      const headers = await getFirebaseAuthHeader();
      const item = await createItem(
        {
          itemName: createForm.itemName,
          category: createForm.category,
          unit: createForm.unit || "pcs",
          openingStock: Number(createForm.openingStock) || 0,
          price: Number(createForm.price) || 0,
          reorderLevel:
            createForm.reorderLevel === ""
              ? null
              : Number(createForm.reorderLevel),
          notes: createForm.notes,
        },
        headers
      );
      setItems((current) => [...current, item]);
      setCreateForm(EMPTY_CREATE);
      setShowAdd(false);
      toast.success(`${item.itemName} added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleSeed() {
    if (
      !window.confirm(
        "Replace ALL items with the Merry Mary catalog? Current stock quantities will be reset to zero."
      )
    ) {
      return;
    }
    setSeeding(true);
    try {
      const headers = await getFirebaseAuthHeader();
      const result = await seedMerryMaryCatalog(headers);
      setItems(result.items);
      toast.success(`Loaded ${result.count} Merry Mary items.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  async function handleRepairIds() {
    if (
      !window.confirm(
        "Renumber duplicate Item IDs in the sheet? The first row of each ID is kept; later duplicates get new MM-xxx IDs. Stock values are unchanged."
      )
    ) {
      return;
    }
    setRepairing(true);
    try {
      const headers = await getFirebaseAuthHeader();
      const result = await repairDuplicateItemIds(headers);
      setItems(result.items);
      toast.success(
        result.count === 0
          ? "No duplicate Item IDs found."
          : `Repaired ${result.count} duplicate ID${result.count === 1 ? "" : "s"}.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  }

  function updateField(
    rowIndex: number,
    field: keyof InventoryItem,
    value: string
  ) {
    setItems((current) =>
      current.map((item) => {
        if (item.rowIndex !== rowIndex) return item;
        if (field === "openingStock" || field === "price") {
          return { ...item, [field]: Number(value) || 0 };
        }
        if (field === "reorderLevel") {
          return {
            ...item,
            reorderLevel: value === "" ? null : Number(value),
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1 space-y-2">
          <Label htmlFor="items-search">Search items</Label>
          <Input
            id="items-search"
            placeholder="Search by item or category"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "Add item"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleSeed}
          disabled={seeding || repairing}
        >
          {seeding ? "Loading…" : "Load Merry Mary catalog"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleRepairIds}
          disabled={repairing || seeding}
        >
          {repairing ? "Repairing…" : "Repair duplicate IDs"}
        </Button>
      </div>

      {isFiltering && (
        <p className="text-sm text-slate-500">
          {filteredItems.length} of {items.length} items
        </p>
      )}

      {showAdd && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New item</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleCreate}>
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="new-name">Name</Label>
                <Input
                  id="new-name"
                  value={createForm.itemName}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, itemName: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-category">Category</Label>
                <Input
                  id="new-category"
                  value={createForm.category}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, category: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-unit">Unit</Label>
                <Input
                  id="new-unit"
                  value={createForm.unit}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, unit: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-opening">Opening</Label>
                <Input
                  id="new-opening"
                  type="number"
                  value={createForm.openingStock}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, openingStock: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-price">Price</Label>
                <Input
                  id="new-price"
                  type="number"
                  value={createForm.price}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, price: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-reorder">Reorder</Label>
                <Input
                  id="new-reorder"
                  type="number"
                  value={createForm.reorderLevel}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, reorderLevel: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="new-notes">Notes</Label>
                <Input
                  id="new-notes"
                  value={createForm.notes}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, notes: e.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Button type="submit" disabled={creating}>
                  {creating ? "Adding…" : "Create item"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {filteredItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          {isFiltering ? "No items match your search." : "No items found. Add an item or load the Merry Mary catalog."}
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Opening</TableHead>
                  <TableHead>Closing</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Reorder</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.rowIndex}>
                    <TableCell>
                      <Input
                        value={item.itemName}
                        onChange={(event) =>
                          updateField(item.rowIndex, "itemName", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.category}
                        onChange={(event) =>
                          updateField(item.rowIndex, "category", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.unit}
                        onChange={(event) =>
                          updateField(item.rowIndex, "unit", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.openingStock}
                        onChange={(event) =>
                          updateField(item.rowIndex, "openingStock", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {formatNumber(item.closingStock)} {item.unit}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.price}
                        onChange={(event) =>
                          updateField(item.rowIndex, "price", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.reorderLevel ?? ""}
                        onChange={(event) =>
                          updateField(item.rowIndex, "reorderLevel", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.notes}
                        onChange={(event) =>
                          updateField(item.rowIndex, "notes", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        onClick={() => saveItem(item)}
                        disabled={savingRow === item.rowIndex}
                      >
                        {savingRow === item.rowIndex ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(item)}
                        disabled={deletingRow === item.rowIndex}
                      >
                        {deletingRow === item.rowIndex ? "…" : "Delete"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4 md:hidden">
            {filteredItems.map((item) => (
              <Card key={item.rowIndex}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {item.itemName || "Unnamed item"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${item.itemId}-name`}>Item name</Label>
                    <Input
                      id={`${item.itemId}-name`}
                      value={item.itemName}
                      onChange={(event) =>
                        updateField(item.rowIndex, "itemName", event.target.value)
                      }
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${item.itemId}-category`}>Category</Label>
                      <Input
                        id={`${item.itemId}-category`}
                        value={item.category}
                        onChange={(event) =>
                          updateField(item.rowIndex, "category", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${item.itemId}-unit`}>Unit</Label>
                      <Input
                        id={`${item.itemId}-unit`}
                        value={item.unit}
                        onChange={(event) =>
                          updateField(item.rowIndex, "unit", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${item.itemId}-opening`}>Opening stock</Label>
                      <Input
                        id={`${item.itemId}-opening`}
                        type="number"
                        value={item.openingStock}
                        onChange={(event) =>
                          updateField(item.rowIndex, "openingStock", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Closing stock</Label>
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {formatNumber(item.closingStock)} {item.unit}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${item.itemId}-price`}>Price</Label>
                      <Input
                        id={`${item.itemId}-price`}
                        type="number"
                        value={item.price}
                        onChange={(event) =>
                          updateField(item.rowIndex, "price", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${item.itemId}-reorder`}>Reorder level</Label>
                      <Input
                        id={`${item.itemId}-reorder`}
                        type="number"
                        value={item.reorderLevel ?? ""}
                        onChange={(event) =>
                          updateField(item.rowIndex, "reorderLevel", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${item.itemId}-notes`}>Notes</Label>
                    <Input
                      id={`${item.itemId}-notes`}
                      value={item.notes}
                      onChange={(event) =>
                        updateField(item.rowIndex, "notes", event.target.value)
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => saveItem(item)}
                      disabled={savingRow === item.rowIndex}
                    >
                      {savingRow === item.rowIndex ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDelete(item)}
                      disabled={deletingRow === item.rowIndex}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
