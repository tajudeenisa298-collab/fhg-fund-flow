import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Network, Users, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Money } from "@/components/money";
import { fmtNgn } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar } from "@/components/user-avatar";

interface DownlineRow {
  id: string;
  full_name: string;
  email: string;
  leader_id: string | null;
  sponsor_id: string | null;
  rank: string;
  balance_usd: number;
  can_handle_funds: boolean;
  avatar_url: string | null;
  depth: number;
}

interface SubLeaderSummary {
  leader_id: string;
  leader_name: string;
  purse_balance_usd: number;
  office_balance_ngn: number;
  pending_withdrawal_count: number;
  pending_upkeep_count: number;
}

export function OrganisationSection({ leaderId }: { leaderId: string }) {
  const { ngnRate } = useAuth();
  const [rows, setRows] = useState<DownlineRow[]>([]);
  const [summary, setSummary] = useState<Map<string, SubLeaderSummary>>(new Map());
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: tree, error: e1 }, { data: sum }] = await Promise.all([
        supabase.rpc("get_downline", { _root: leaderId }),
        supabase.rpc("get_org_subleader_summary", { _root: leaderId }),
      ]);
      if (cancelled) return;
      setRows(e1 ? [] : ((tree as DownlineRow[]) ?? []));
      const map = new Map<string, SubLeaderSummary>();
      ((sum as SubLeaderSummary[]) ?? []).forEach((s) => map.set(s.leader_id, s));
      setSummary(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [leaderId]);

  if (loading) return null;

  const subLeaders = rows.filter((r) => r.can_handle_funds && r.id !== leaderId);
  if (subLeaders.length === 0) return null;

  const byHandler = new Map<string, DownlineRow[]>();
  for (const r of rows) {
    if (!r.can_handle_funds && r.leader_id && r.leader_id !== leaderId) {
      const list = byHandler.get(r.leader_id) ?? [];
      list.push(r);
      byHandler.set(r.leader_id, list);
    }
  }

  const totalDownlineMembers = rows.filter((r) => !r.can_handle_funds).length;
  const totalManagedBalance = rows
    .filter((r) => !r.can_handle_funds)
    .reduce((s, r) => s + Number(r.balance_usd), 0);
  const totalSubLeaderBalance = subLeaders.reduce((s, r) => s + Number(r.balance_usd), 0);
  const totalDownstreamBalance = totalManagedBalance + totalSubLeaderBalance;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Network className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Organisation</h2>
            <p className="text-sm text-muted-foreground">
              Cross-team oversight of every leader and member in your downline.
            </p>
          </div>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sub-leaders</p>
            <p className="text-lg font-semibold">{subLeaders.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Members</p>
            <p className="text-lg font-semibold">{totalDownlineMembers}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Held funds</p>
            <Money usd={totalDownstreamBalance} size="sm" className="items-end" />
            <p className="text-[10px] text-muted-foreground">incl. sub-leader balances</p>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y rounded-xl border">
        {subLeaders.map((sl) => {
          const members = byHandler.get(sl.id) ?? [];
          const teamBalance = members.reduce((s, m) => s + Number(m.balance_usd), 0);
          const s = summary.get(sl.id);
          const isOpen = openTeam === sl.id;
          const escalations = (s?.pending_withdrawal_count ?? 0) + (s?.pending_upkeep_count ?? 0);
          return (
            <div key={sl.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                onClick={() => setOpenTeam(isOpen ? null : sl.id)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {isOpen ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <UserAvatar name={sl.full_name} avatarPath={sl.avatar_url} className="size-9 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {sl.full_name}
                      {escalations > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                          <AlertTriangle className="size-3" />
                          {escalations} pending
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sl.rank} · depth {sl.depth} · own balance{" "}
                      <span className="font-mono text-foreground">${Number(sl.balance_usd).toLocaleString()}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="hidden sm:block">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Team</p>
                    <p className="flex items-center justify-end gap-1 text-sm font-medium">
                      <Users className="size-3.5" />
                      {members.length}
                    </p>
                  </div>
                  <Money usd={teamBalance} size="sm" className="items-end" />
                </div>
              </button>
              {isOpen && (
                <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
                  {s && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div className="rounded-lg border bg-card p-2">
                        <p className="text-muted-foreground">Purse</p>
                        <p className="font-mono font-semibold">${Number(s.purse_balance_usd).toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-2">
                        <p className="text-muted-foreground">Office</p>
                        <p className="font-mono font-semibold">{fmtNgn(s.office_balance_ngn / Math.max(ngnRate, 1), ngnRate)}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-2">
                        <p className="text-muted-foreground">Pending withdrawals</p>
                        <p className="font-mono font-semibold">{s.pending_withdrawal_count}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-2">
                        <p className="text-muted-foreground">Pending upkeep</p>
                        <p className="font-mono font-semibold">{s.pending_upkeep_count}</p>
                      </div>
                    </div>
                  )}
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No members under this leader yet.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-lg border bg-card">
                      {members.map((m) => (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar name={m.full_name} avatarPath={m.avatar_url} className="size-7 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{m.full_name}</p>
                              <p className="truncate text-xs text-muted-foreground">{m.rank}</p>
                            </div>
                          </div>
                          <Money usd={m.balance_usd} size="sm" className="items-end" />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Fund rules, upkeep plans and office ledger are scoped per fund handler — each sub-leader runs their own.
        Use the per-team breakdown above to drill in.
      </p>
    </section>
  );
}
