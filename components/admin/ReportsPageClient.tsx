"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { fetchReport } from "@/lib/api-client";
import type {
  ReportPeriod,
  ReportSalesLedgerRow,
  ReportStockInRow,
} from "@/lib/reports";
import { formatNumber } from "@/lib/utils";

const PERIOD_OPTIONS: Array<{ label: string; value: ReportPeriod }> = [
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "4 months", value: "4months" },
  { label: "Custom", value: "custom" },
];

type ReportSections = {
  stockIn: boolean;
  salesLedger: boolean;
};

const DEFAULT_SECTIONS: ReportSections = {
  stockIn: false,
  salesLedger: true,
};

const SECTION_OPTIONS: Array<{ key: keyof ReportSections; label: string }> = [
  { key: "salesLedger", label: "Sales records" },
  { key: "stockIn", label: "Stock In" },
];

type ReportData = {
  period: ReportPeriod;
  from: string;
  to: string;
  stockIn: ReportStockInRow[];
  salesLedger: ReportSalesLedgerRow[];
};

function EmptyBlock({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
      {message}
    </p>
  );
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return value === 0 ? "—" : "—";
  return formatNumber(value);
}

function StockInTable({ rows }: { rows: ReportStockInRow[] }) {
  if (!rows.length) {
    return <EmptyBlock message="No stock-in movements in this period." />;
  }
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Name</TableHead>
              <TableHead>Stock In</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.itemId}>
                <TableCell className="font-medium">{row.itemName}</TableCell>
                <TableCell>{formatNumber(row.stockIn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <Card key={row.itemId}>
            <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
              <p className="font-medium text-slate-900">{row.itemName}</p>
              <p className="text-slate-700">{formatNumber(row.stockIn)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function SalesLedgerTable({ rows }: { rows: ReportSalesLedgerRow[] }) {
  if (!rows.length) {
    return <EmptyBlock message="No items to show for this period." />;
  }

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="sales-ledger-wrap overflow-x-auto">
      <table className="sales-ledger w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col">NO</th>
            <th scope="col">ITEM</th>
            <th scope="col">OPEN</th>
            <th scope="col">ADD</th>
            <th scope="col">TOTAL</th>
            <th scope="col">B.B.F</th>
            <th scope="col">SALES</th>
            <th scope="col">PRICE</th>
            <th scope="col">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.itemId}>
              <td className="sales-ledger-num">{index + 1}</td>
              <td className="sales-ledger-item">{row.itemName}</td>
              <td className="sales-ledger-num">
                {row.open ? formatNumber(row.open) : "—"}
              </td>
              <td className="sales-ledger-num">
                {row.add ? formatNumber(row.add) : "—"}
              </td>
              <td className="sales-ledger-num">
                {row.total ? formatNumber(row.total) : "—"}
              </td>
              <td className="sales-ledger-num">
                {row.bbf || row.sales || row.add
                  ? formatNumber(row.bbf)
                  : "—"}
              </td>
              <td className="sales-ledger-num">
                {row.sales ? formatNumber(row.sales) : "—"}
              </td>
              <td className="sales-ledger-num">
                {row.price ? formatNumber(row.price) : "—"}
              </td>
              <td className="sales-ledger-num">
                {row.amount ? formatMoney(row.amount) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8} className="sales-ledger-item font-bold">
              TOTAL AMOUNT
            </td>
            <td className="sales-ledger-num font-bold">
              {formatNumber(totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ReportsPageClient() {
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sections, setSections] = useState<ReportSections>(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const report = await fetchReport({
        period,
        from: period === "custom" ? from : undefined,
        to: period === "custom" ? to : undefined,
      });
      setData(report);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  useEffect(() => {
    if (period === "custom" && (!from || !to)) {
      setLoading(false);
      setData(null);
      return;
    }
    load();
  }, [load, period, from, to]);

  const hasVisibleSection = sections.stockIn || sections.salesLedger;

  return (
    <div className="space-y-6">
      <div className="report-controls space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Reports</h1>
            <p className="text-sm text-slate-500">
              Merry Mary sales records for print.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={period === option.value ? "default" : "outline"}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {period === "custom" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          {SECTION_OPTIONS.map((option) => (
            <label
              key={option.key}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={sections[option.key]}
                onChange={(event) =>
                  setSections((current) => ({
                    ...current,
                    [option.key]: event.target.checked,
                  }))
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState
          label="Loading report"
          layout="centered"
          className="min-h-[30vh]"
        />
      ) : !data ? (
        <EmptyBlock
          message={
            period === "custom" && (!from || !to)
              ? "Select from and to dates for a custom report."
              : "No report data."
          }
        />
      ) : !hasVisibleSection ? (
        <EmptyBlock message="Select at least one section to display." />
      ) : (
        <div className="report-print-root space-y-8">
          {sections.salesLedger && (
            <section className="space-y-3">
              <div className="sales-ledger-title text-center">
                <h2 className="text-lg font-bold uppercase tracking-wide text-slate-900">
                  Merry Mary Restaurant Sales Records
                </h2>
                <p className="text-sm text-slate-600">
                  {data.from} — {data.to}
                </p>
              </div>
              <p className="report-controls text-xs text-slate-500">
                OPEN + ADD = TOTAL · SALES = TOTAL − B.B.F · AMOUNT = SALES × PRICE
              </p>
              <SalesLedgerTable rows={data.salesLedger} />
            </section>
          )}

          {sections.stockIn && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Stock In</h2>
              <StockInTable rows={data.stockIn} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
