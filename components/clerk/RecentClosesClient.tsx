"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { fetchRecentCloses } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";

type RecentCloseRow = {
  itemId: string;
  itemName: string;
  opening: number;
  add: number;
  closing: number;
  sales: number;
  price: number;
  amount: number;
};

function formatClosedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function RecentCloseTable({
  rows,
  totalAmount,
}: {
  rows: RecentCloseRow[];
  totalAmount: number;
}) {
  return (
    <table className="sales-ledger w-full min-w-[640px] border-collapse text-sm">
      <thead>
        <tr>
          <th scope="col">ITEM</th>
          <th scope="col">PREV. OPEN</th>
          <th scope="col">ADD</th>
          <th scope="col">B.B.F</th>
          <th scope="col">SALES</th>
          <th scope="col">PRICE</th>
          <th scope="col">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.itemId}>
            <td className="sales-ledger-item">{row.itemName}</td>
            <td className="sales-ledger-num">{formatNumber(row.opening)}</td>
            <td className="sales-ledger-num">
              {row.add ? formatNumber(row.add) : "—"}
            </td>
            <td className="sales-ledger-num">{formatNumber(row.closing)}</td>
            <td className="sales-ledger-num">
              {row.sales ? formatNumber(row.sales) : "—"}
            </td>
            <td className="sales-ledger-num">
              {row.price ? formatNumber(row.price) : "—"}
            </td>
            <td className="sales-ledger-num">
              {row.amount ? formatNumber(row.amount) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={6} className="sales-ledger-item font-bold">
            TOTAL
          </td>
          <td className="sales-ledger-num font-bold">
            {formatNumber(totalAmount)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function RecentClosesClient() {
  const [loading, setLoading] = useState(true);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [rows, setRows] = useState<RecentCloseRow[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchRecentCloses();
        setClosedAt(data.closedAt);
        setUserEmail(data.userEmail);
        setRows(data.rows);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load recent close"
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <LoadingState
        label="Loading recent close"
        layout="centered"
        className="min-h-[40vh]"
      />
    );
  }

  const totalAmount = rows.reduce((sum, row) => sum + (row.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="report-controls flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Recent close
          </h1>
          <p className="text-sm text-slate-500">
            All catalog items for the latest close — previous opening, B.B.F,
            sales and amount.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
          disabled={!rows.length}
        >
          Print / PDF
        </Button>
      </div>

      {!rows.length ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          No items in inventory yet.
        </p>
      ) : (
        <div className="report-print-root space-y-4">
          <div className="text-center sm:text-left">
            <h2 className="text-base font-semibold uppercase tracking-wide text-slate-900">
              Last closing stock
            </h2>
            <p className="text-sm text-slate-600">
              {closedAt
                ? `${formatClosedAt(closedAt)}${userEmail ? ` · ${userEmail}` : ""}`
                : "No close sync yet — showing current sheet stock for all items"}
            </p>
          </div>

          <div className="hidden md:block print:hidden">
            <div className="sales-ledger-wrap overflow-x-auto">
              <RecentCloseTable rows={rows} totalAmount={totalAmount} />
            </div>
          </div>

          <div className="space-y-3 md:hidden print:hidden">
            {rows.map((row) => (
              <Card key={row.itemId}>
                <CardContent className="space-y-2 p-4 text-sm">
                  <p className="font-medium text-slate-900">{row.itemName}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-slate-500">Prev. open</p>
                      <p className="font-medium">{formatNumber(row.opening)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">ADD</p>
                      <p className="font-medium">
                        {row.add ? formatNumber(row.add) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">B.B.F</p>
                      <p className="font-medium">{formatNumber(row.closing)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Sales</p>
                      <p className="font-medium">
                        {row.sales ? formatNumber(row.sales) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Price</p>
                      <p className="font-medium">
                        {row.price ? formatNumber(row.price) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Amount</p>
                      <p className="font-medium">
                        {row.amount ? formatNumber(row.amount) : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="flex items-center justify-between p-4 text-sm font-bold">
                <span>Total</span>
                <span>{formatNumber(totalAmount)}</span>
              </CardContent>
            </Card>
          </div>

          <div className="hidden print:block">
            <RecentCloseTable rows={rows} totalAmount={totalAmount} />
          </div>
        </div>
      )}
    </div>
  );
}
