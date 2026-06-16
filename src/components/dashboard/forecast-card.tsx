import { useEffect, useState } from "react";
import { CalendarRange, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtUsd, fmtNgn } from "@/lib/format";
import type { UpkeepPlan, FundRule } from "@/lib/types";

interface Props {
  leaderId: string;
  /** upkeep_plans loaded in parent (avoids a refetch) */
  plans: UpkeepPlan[];
}

export function ForecastCard({ leaderId, plans }: Props) {
  const { ngnRate } = useAuth();
  const [rules, setRules] = useState<FundRule[]>([]);

  useEffect(() => {
    supabase
      .from("fund_rules")
      .select("*")
      .eq("leader_id", leaderId)
      .eq("active", true)
      .then(({ data }) => setRules((data as FundRule[]) ?? []));
  }, [leaderId]);

  const horizon = Date.now() + 7 * 86400000;

  const upcomingUpkeepUsd = plans
    .filter((p) => p.active && new Date(p.next_run_at).getTime() <= horizon)
    .reduce((s, p) => s + Number(p.amount_usd), 0);

  const upcomingRulesNgn = rules
    .filter((r) => r.next_run_at && new Date(r.next_run_at).getTime() <= horizon)
    .reduce((s, r) => s + Number(r.amount_ngn), 0);

  const planCount = plans.filter(
    (p) => p.active && new Date(p.next_run_at).getTime() <= horizon,
  ).length;

  const ruleCount = rules.filter(
    (r) => r.next_run_at && new Date(r.next_run_at).getTime() <= horizon,
  ).length;

  if (planCount === 0 && ruleCount === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarRange className="size-4 text-primary" /> Next 7 days
          </h2>
          <p className="text-xs text-muted-foreground">
            What's scheduled to leave your team's balances this week.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
          {planCount + ruleCount} scheduled
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <TrendingDown className="size-3.5" /> Upkeep dispensations
          </p>
          <p className="mt-1 font-mono text-lg font-semibold">{fmtUsd(upcomingUpkeepUsd)}</p>
          <p className="text-xs text-muted-foreground">
            {planCount} active plan{planCount === 1 ? "" : "s"} · {fmtNgn(upcomingUpkeepUsd, ngnRate)}
          </p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <TrendingDown className="size-3.5" /> Fund rule deductions
          </p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {fmtNgn(upcomingRulesNgn / Math.max(ngnRate, 1), ngnRate)}
          </p>
          <p className="text-xs text-muted-foreground">
            {ruleCount} active rule{ruleCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </section>
  );
}
