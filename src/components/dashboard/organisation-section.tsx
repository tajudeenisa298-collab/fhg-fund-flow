import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Network, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Money } from "@/components/money";

interface DownlineRow {
  id: string;
  full_name: string;
  email: string;
  leader_id: string | null;
  sponsor_id: string | null;
  rank: string;
  balance_usd: number;
  can_handle_funds: boolean;
  depth: number;
}

export function OrganisationSection({ leaderId }: { leaderId: string }) {
  const [rows, setRows] = useState<DownlineRow[]>([]);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_downline", { _root: leaderId });
      if (cancelled) return;
      if (error) {
        setRows([]);
      } else {
        setRows((data as DownlineRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [leaderId]);

  if (loading) return null;

  // Sub-leaders = anyone in downline who handles funds themselves (excluding root)
  const subLeaders = rows.filter((r) => r.can_handle_funds && r.id !== leaderId);
  if (subLeaders.length === 0) return null;

  // Members grouped by their fund handler
  const byHandler = new Map<string, DownlineRow[]>();
  for (const r of rows) {
    if (!r.can_handle_funds && r.leader_id && r.leader_id !== leaderId) {
      const list = byHandler.get(r.leader_id) ?? [];
      list.push(r);
      byHandler.set(r.leader_id, list);
    }
  }

  const totalDownlineMembers = rows.filter((r) => !r.can_handle_funds).length;
  const totalDownstreamBalance = rows
    .filter((r) => !r.can_handle_funds)
    .reduce((s, r) => s + Number(r.balance_usd), 0);

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
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y rounded-xl border">
        {subLeaders.map((sl) => {
          const members = byHandler.get(sl.id) ?? [];
          const teamBalance = members.reduce((s, m) => s + Number(m.balance_usd), 0);
          const isOpen = openTeam === sl.id;
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
                  <div className="min-w-0">
                    <p className="truncate font-medium">{sl.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sl.rank} · depth {sl.depth}
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
                <div className="border-t bg-muted/20 px-4 py-3">
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
                          <div className="min-w-0">
                            <p className="truncate font-medium">{m.full_name}</p>
                            <p className="truncate text-xs text-muted-foreground">{m.rank}</p>
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
    </section>
  );
}
