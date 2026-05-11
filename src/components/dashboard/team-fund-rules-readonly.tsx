/**
 * Read-only fund-rules card for downline members so they can see what the
 * team leader is auto-deducting (office, TV fund, etc.).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type FundRule, FUND_FREQ_LABEL } from "@/lib/types";

const ngn = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

export function TeamFundRulesReadonly({ leaderId }: { leaderId: string | null }) {
  const [rules, setRules] = useState<FundRule[]>([]);

  useEffect(() => {
    if (!leaderId) return;
    supabase
      .from("fund_rules").select("*").eq("leader_id", leaderId).eq("active", true)
      .then(({ data }) => setRules((data as FundRule[]) ?? []));
  }, [leaderId]);

  if (!leaderId) return null;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <h2 className="text-base font-semibold">Team fund rules</h2>
      <p className="text-sm text-muted-foreground">
        Automatic deductions your team leader applies. These are taken from your deposits or balance.
      </p>
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
    </section>
  );
}
