/**
 * Read-only fund-rules card for downline members so they can see what the
 * team leader is auto-deducting (office, TV fund, etc.).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type FundRule, FUND_FREQ_LABEL, FREQ_LABEL, type RankUpkeepDefault } from "@/lib/types";

const ngn = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

export function TeamFundRulesReadonly({ leaderId }: { leaderId: string | null }) {
  const [rules, setRules] = useState<FundRule[]>([]);
  const [defaults, setDefaults] = useState<RankUpkeepDefault[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!leaderId) return;
    Promise.all([
      supabase.from("fund_rules").select("*").eq("leader_id", leaderId).eq("active", true),
      supabase.from("rank_upkeep_defaults").select("*").eq("leader_id", leaderId).order("rank"),
    ]).then(([fundRules, rankDefaults]) => {
      setRules((fundRules.data as FundRule[]) ?? []);
      setDefaults((rankDefaults.data as RankUpkeepDefault[]) ?? []);
    });
  }, [leaderId]);

  if (!leaderId) return null;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left">
        <h2 className="text-base font-semibold text-primary hover:underline">Team fund rules</h2>
        <p className="text-sm text-muted-foreground">
          Automatic deductions and rank upkeep from your team leader.
        </p>
      </button>
      <ul className="mt-4 divide-y rounded-xl border">
        {rules.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            Your team leader hasn't set any active rules.
          </li>
        )}
        {rules.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{r.name}</p>
              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {r.kind === "per_usd"
                ? <><span className="font-mono font-semibold text-foreground">{ngn(Number(r.amount_ngn))}</span> per $1 deposit</>
                : <><span className="font-mono font-semibold text-foreground">{ngn(Number(r.amount_ngn))}</span>{" "}
                    {r.frequency ? FUND_FREQ_LABEL[r.frequency].toLowerCase() : ""}</>}
            </p>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>All fund rules</DialogTitle>
            <DialogDescription>
              Active team leader fees, office support, custom rules, and rank upkeep defaults.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
            <RuleGroup title="Team leader fees" rows={rules.filter((r) => r.destination === "team_leader")} />
            <RuleGroup title="Office support" rows={rules.filter((r) => r.destination === "office_support")} />
            <RuleGroup title="Custom fund rules" rows={rules.filter((r) => r.destination === "custom")} />
            <RuleGroup title="Member upkeep rules" rows={rules.filter((r) => r.destination === "member_upkeep")} />
            <section>
              <h3 className="text-sm font-semibold">Upkeep by rank</h3>
              <ul className="mt-2 divide-y rounded-xl border">
                {defaults.length === 0 && <li className="px-3 py-4 text-xs text-muted-foreground">No rank upkeep defaults set.</li>}
                {defaults.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="font-medium">{d.rank}</span>
                    <span className="text-right text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">${Number(d.amount_usd).toLocaleString()}</span> · {FREQ_LABEL[d.frequency]}
                      {d.frequency === "custom_days" && d.custom_days ? ` (${d.custom_days} days)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RuleGroup({ title, rows }: { title: string; rows: FundRule[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 divide-y rounded-xl border">
        {rows.length === 0 && <li className="px-3 py-4 text-xs text-muted-foreground">No active rules.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{r.name}</p>
              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
            </div>
            <span className="text-right text-xs text-muted-foreground">
              {r.kind === "per_usd" ? (
                <><span className="font-mono font-semibold text-foreground">{ngn(Number(r.amount_ngn))}</span> per $1 deposit</>
              ) : (
                <><span className="font-mono font-semibold text-foreground">{ngn(Number(r.amount_ngn))}</span> {r.frequency ? FUND_FREQ_LABEL[r.frequency].toLowerCase() : ""}</>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
