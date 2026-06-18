import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUsd, fmtDate } from "@/lib/format";

interface Row {
  id: string;
  member_id: string;
  member_name: string;
  leader_id: string;
  leader_name: string;
  amount_usd: number;
  status: string;
  description: string;
  created_at: string;
}

/**
 * Root-leader escalation view: every pending withdrawal across the entire org,
 * including those held by sub-leaders. Surfaces ones that have been pending
 * for too long so a root leader can step in.
 */
export function OrgPendingWithdrawals({ leaderId }: { leaderId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("get_org_pending_withdrawals", { _root: leaderId });
      if (cancelled) return;
      // Exclude rows the leader handles directly — they already live in the main queue
      setRows(((data as Row[]) ?? []).filter((r) => r.leader_id !== leaderId));
      setLoaded(true);
    };
    load();
    const ch = supabase
      .channel(`org-wd:${leaderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [leaderId]);

  if (!loaded || rows.length === 0) return null;

  const stale = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() > 3 * 86400000);

  return (
    <section className="rounded-2xl border-2 border-warning/40 bg-warning/5 p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="size-4 text-warning" />
            Org-wide pending withdrawals
          </h2>
          <p className="text-sm text-muted-foreground">
            Requests handled by your sub-leaders. {stale.length > 0
              ? `${stale.length} have been waiting more than 3 days — consider following up.`
              : "Use this to escalate if a sub-leader is slow."}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
          {rows.length} pending
        </span>
      </div>

      <ul className="mt-4 divide-y rounded-xl border bg-card">
        {rows.map((r) => {
          const ageDays = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
          const isStale = ageDays >= 3;
          return (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {fmtUsd(r.amount_usd)} · {r.member_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Held by <span className="font-medium text-foreground">{r.leader_name}</span> · {fmtDate(r.created_at)}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  isStale ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
                }`}
              >
                <Clock className="size-3" />
                {ageDays === 0 ? "today" : `${ageDays}d`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
