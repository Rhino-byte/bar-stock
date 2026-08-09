"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { fetchProfits } from "@/lib/api-client";
import type { ReportPeriod } from "@/lib/reports";
import { formatNumber } from "@/lib/utils";

const PERIOD_OPTIONS: Array<{ label: string; value: ReportPeriod }> = [
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "4 months", value: "4months" },
  { label: "Custom", value: "custom" },
];

type ProfitRow = {
  itemId: string;
  itemName: string;
  salesQty: number;
  sellPrice: number;
  buyPrice: number;
  revenue: number;
  cost: number;
  profit: number;
};

type ProfitData = {
  period: ReportPeriod;
  from: string;
  to: string;
  rows: ProfitRow[];
  totals: {
    salesQty: number;
    revenue: number;
    cost: number;
    profit: number;
  };
};

function EmptyBlock({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
      {message}
    </p>
  );
}

function money(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  return formatNumber(value);
}

export function ProfitsPageClient() {
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfitData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const report = await fetchProfits({
        period,
        from: period === "custom" ? from : undefined,
        to: period === "custom" ? to : undefined,
      });
      setData(report);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load profits");
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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Profit</h1>
          <p className="text-sm text-slate-500">
            Sales profit from current sheet sell price and buying price. Missing
            buying prices count as 0.
          </p>
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
              <Label htmlFor="profit-from">From</Label>
              <Input
                id="profit-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profit-to">To</Label>
              <Input
                id="profit-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingState
          label="Loading profits"
          layout="centered"
          className="min-h-[30vh]"
        />
      ) : !data ? (
        <EmptyBlock
          message={
            period === "custom" && (!from || !to)
              ? "Select from and to dates for a custom range."
              : "No profit data."
          }
        />
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {data.from} — {data.to}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Revenue
                </p>
                <p className="text-xl font-semibold text-slate-900">
                  {formatNumber(data.totals.revenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Cost
                </p>
                <p className="text-xl font-semibold text-slate-900">
                  {formatNumber(data.totals.cost)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Profit
                </p>
                <p className="text-xl font-semibold text-slate-900">
                  {formatNumber(data.totals.profit)}
                </p>
              </CardContent>
            </Card>
          </div>

          {!data.rows.length ? (
            <EmptyBlock message="No sales in this period." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Sell</TableHead>
                      <TableHead className="text-right">Buy</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.itemId}>
                        <TableCell className="font-medium">{row.itemName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.salesQty)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.sellPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.buyPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.cost)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(row.profit)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50">
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatNumber(data.totals.salesQty)}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatNumber(data.totals.revenue)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatNumber(data.totals.cost)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatNumber(data.totals.profit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {data.rows.map((row) => (
                  <Card key={row.itemId}>
                    <CardContent className="space-y-2 p-4 text-sm">
                      <p className="font-medium text-slate-900">{row.itemName}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-slate-500">Sales</p>
                          <p className="font-medium">{formatNumber(row.salesQty)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Profit</p>
                          <p className="font-medium">{money(row.profit)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Sell / Buy</p>
                          <p className="font-medium">
                            {money(row.sellPrice)} / {money(row.buyPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Rev / Cost</p>
                          <p className="font-medium">
                            {money(row.revenue)} / {money(row.cost)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Card>
                  <CardContent className="flex items-center justify-between p-4 text-sm font-bold">
                    <span>Total profit</span>
                    <span>{formatNumber(data.totals.profit)}</span>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
