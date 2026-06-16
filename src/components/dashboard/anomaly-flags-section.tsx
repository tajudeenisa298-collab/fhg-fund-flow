import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth-context";
import { fmtUsd, fmtDate } from "@/lib/format";

type Txn = {
  id: string;
  member_id: string;
  type: string;
  amount_usd: number | string;
  created_at: string;
  note: string | null;
};

type Flag = {
  txn: Txn;
  member: Profile | undefined;
  avg: number;
  ratio: number;
  reason: string;
};

const DEPOSIT_TYPES = new Set(["deposit"]);
const WITHDRAWAL_TYPES = new Set(["withdrawal"]);

export function AnomalyFlagsSection({ leaderId, team }: { leaderId: string; team: Profile[] }) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const memberMap = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  useEffect(() => {
    supabase
      .from("transactions")
      .select("id, member_id, type, amount_usd, created_at, note")
      .eq("leader_id", leaderId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setTxns((data as Txn[]) ?? []));
  }, [leaderId]);

  const flags = useMemo<Flag[]>(() => {
    // group historical txns per member per kind
    const byMember = new Map<string, { deposits: number[]; withdrawals: number[] }>();
    for (const t of txns) {
      const e = byMember.get(t.member_id) ?? { deposits: [], withdrawals: [] };
      const amt = Math.abs(Number(t.amount_usd) || 0);
      if (DEPOSIT_TYPES.has(t.type)) e.deposits.push(amt);
      else if (WITHDRAWAL_TYPES.has(t.type)) e.withdrawals.push(amt);
      byMember.set(t.member_id, e);
    }
    const recent = txns.slice(0, 80); // most recent first
    const out: Flag[] = [];
    for (const t of recent) {
      const amt = Math.abs(Number(t.amount_usd) || 0);
      const bucket = byMember.get(t.member_id);
      if (!bucket) continue;
      const series = DEPOSIT_TYPES.has(t.type)
        ? bucket.deposits
        : WITHDRAWAL_TYPES.has(t.type)
          ? bucket.withdrawals
          : null;
      if (!series || series.length < 3) continue;
      // exclude this txn from the historical average
      const others = series.filter((v) => v !== amt);
      if (others.length < 2) continue;
      const avg = others.reduce((a, b) => a + b, 0) / others.length;
      if (avg <= 0) continue;
      const ratio = amt / avg;
      if (ratio >= 5) {
        out.push({
          txn: t,
          member: memberMap.get(t.member_id),
          avg,
          ratio,
          reason: DEPOSIT_TYPES.has(t.type)
            ? `Deposit ${ratio.toFixed(1)}× this member's avg`
            : `Withdrawal ${ratio.toFixed(1)}× this member's avg`,
        });
      }
    }
    return out.slice(0, 6);
  }, [txns, memberMap]);

  if (flags.length === 0) return null;

  return (
    <section className="rounded-2xl border border-warning/40 bg-warning/5 p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
        <AlertTriangle className="size-4 text-warning" />
        Anomaly flags ({flags.length})
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Transactions that look unusual versus this member's own history.
      </p>
      <ul className="mt-3 divide-y rounded-xl border bg-card">
        {flags.map((f) => (
          <li key={f.txn.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{f.member?.full_name ?? "Unknown member"}</p>
              <p className="text-xs text-muted-foreground">
                {f.reason} · avg {fmtUsd(f.avg)} · {fmtDate(f.txn.created_at)}
              </p>
            </div>
            <span className="font-mono font-semibold">{fmtUsd(Number(f.txn.amount_usd))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
