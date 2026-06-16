import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUsd, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Reconciliation = {
  deposits_usd: number;
  withdrawals_usd: number;
  fund_deductions_usd: number;
  bank_fees_usd: number;
  adjustments_usd: number;
  releases_usd: number;
  upkeep_acknowledged_usd: number;
  upkeep_pending_usd: number;
  upkeep_disputed_usd: number;
  office_support_in_ngn: number;
  office_expense_out_ngn: number;
  purse_credits_usd: number;
  purse_debits_usd: number;
  team_balance_usd: number;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function ReconciliationSection() {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - offset);
    return d;
  }, [offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      const { data, error } = await supabase.rpc("get_leader_monthly_reconciliation", {
        _month_start: monthKey(monthDate),
      });
      if (cancelled) return;
      if (error) setErr(error.message);
      else setData(((data ?? [])[0] ?? null) as Reconciliation | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [monthDate]);

  const net =
    data
      ? data.deposits_usd +
        data.adjustments_usd -
        data.withdrawals_usd -
        data.fund_deductions_usd -
        data.bank_fees_usd -
        data.releases_usd
      : 0;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-muted-foreground" />
          <div>
            <h2 className="text-base font-semibold">Monthly reconciliation</h2>
            <p className="text-xs text-muted-foreground">
              Money in vs out across the team for {monthLabel(monthDate)}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setOffset((o) => o + 1)}>
            ←
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
          >
            →
          </Button>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}
      {loading && !data && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Deposits in" value={fmtUsd(data.deposits_usd)} tone="success" />
            <Row label="Withdrawals out" value={fmtUsd(data.withdrawals_usd)} tone="destructive" />
            <Row label="Fund deductions" value={fmtUsd(data.fund_deductions_usd)} tone="destructive" />
            <Row label="Bank fees" value={fmtUsd(data.bank_fees_usd)} tone="destructive" />
            <Row label="Adjustments" value={fmtUsd(data.adjustments_usd)} />
            <Row label="Releases" value={fmtUsd(data.releases_usd)} />
            <Row label="Upkeep approved" value={fmtUsd(data.upkeep_acknowledged_usd)} />
            <Row label="Upkeep pending" value={fmtUsd(data.upkeep_pending_usd)} />
            <Row label="Upkeep disputed" value={fmtUsd(data.upkeep_disputed_usd)} tone="destructive" />
            <Row label="Office support in" value={fmtMoney(data.office_support_in_ngn, "NGN")} />
            <Row label="Office expense out" value={fmtMoney(data.office_expense_out_ngn, "NGN")} />
            <Row label="Purse credits" value={fmtUsd(data.purse_credits_usd)} />
            <Row label="Purse debits" value={fmtUsd(data.purse_debits_usd)} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Net change this month</p>
              <p className={`mt-1 font-mono text-lg ${net >= 0 ? "text-success" : "text-destructive"}`}>
                {net >= 0 ? "+" : "−"}
                {fmtUsd(Math.abs(net))}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Team balance held now</p>
              <p className="mt-1 font-mono text-lg">{fmtUsd(data.team_balance_usd)}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm ${cls}`}>{value}</span>
    </div>
  );
}
