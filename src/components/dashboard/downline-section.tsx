/**
 * Pyramid downline view — recursively lists everyone the current user has
 * sponsored (directly or indirectly), with their balance. Click a row to see
 * their full transaction history.
 */
import { useEffect, useMemo, useState } from "react";
import { Users, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Money } from "@/components/money";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberDetailDialog } from "@/components/dashboard/member-detail-dialog";
import type { Profile } from "@/lib/auth-context";

export function DownlineSection({ rootId }: { rootId: string }) {
  const [people, setPeople] = useState<Profile[]>([]);
  const [detail, setDetail] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    // Fetch everyone visible (RLS already restricts to downline + self)
    supabase
      .from("profiles").select("*").neq("id", rootId)
      .then(({ data }) => {
        setPeople((data as Profile[]) ?? []);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`downline:${rootId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId]);

  // Build sponsor → children index for pyramid rendering
  const childrenOf = useMemo(() => {
    const m = new Map<string, Profile[]>();
    for (const p of people) {
      const k = p.sponsor_id ?? "__root__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [people]);

  const totalDownline = people.length;
  const totalBalance = people.filter((p) => !p.can_handle_funds).reduce((s, p) => s + Number(p.balance_usd), 0);

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-4 text-primary" /> Your downline
          </h2>
          <p className="text-sm text-muted-foreground">
            Everyone you sponsored, directly or indirectly. Click anyone to see their history.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{totalDownline} people · combined</p>
          <Money usd={totalBalance} size="sm" className="items-end" />
        </div>
      </div>

      <div className="mt-4 rounded-xl border">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-11/12" />
            <Skeleton className="h-10 w-10/12" />
          </div>
        ) : totalDownline === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No one yet — share your invite code to start your downline.
          </p>
        ) : (
          <Tree sponsorId={rootId} childrenOf={childrenOf} depth={0} onPick={setDetail} />
        )}
      </div>

      <MemberDetailDialog
        member={detail}
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
      />
    </section>
  );
}

function Tree({
  sponsorId, childrenOf, depth, onPick,
}: { sponsorId: string; childrenOf: Map<string, Profile[]>; depth: number; onPick: (p: Profile) => void }) {
  const kids = childrenOf.get(sponsorId) ?? [];
  if (kids.length === 0) return null;
  return (
    <ul className="divide-y">
      {kids.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onPick(p)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-muted/40"
            style={{ paddingLeft: `${depth * 20 + 16}px` }}
          >
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-primary hover:underline">{p.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {p.rank}
                {p.can_handle_funds && " · fund handler"}
              </p>
            </div>
            {!p.can_handle_funds && <Money usd={p.balance_usd} size="sm" className="items-end" />}
          </button>
          <Tree sponsorId={p.id} childrenOf={childrenOf} depth={depth + 1} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}
