import { ClosingStockForm } from "@/components/clerk/ClosingStockForm";

export default function ClerkClosingStockPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Closing Stock</h1>
      <p className="text-sm text-slate-500">
        Enter physical counts (B.B.F). Sales are computed and the period rolls forward.
      </p>
      <div className="pt-4">
        <ClosingStockForm />
      </div>
    </div>
  );
}
