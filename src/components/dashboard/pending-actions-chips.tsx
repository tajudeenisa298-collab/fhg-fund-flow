import { useEffect, useState } from "react";
import { AlertTriangle, Clock, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Counts = {
  pendingRequests: number;
  disputedUpkeeps: number;
  unverifiedBanks: number;
  pendingSignups: number;
};

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function PendingActionsChips({
  leaderId,
  pendingRequests,
  teamIds,
}: {
  leaderId: string;
  pendingRequests: number;
  teamIds: string[];
}) {
  const [counts, setCounts] = useState<Counts>({
    pendingRequests,
    disputedUpkeeps: 0,
    unverifiedBanks: 0,
    pendingSignups: 0,
  });

  useEffect(() => {
    setCounts((c) => ({ ...c, pendingRequests }));
  }, [pendingRequests]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ count: disputed }, { count: signups }] = await Promise.all([
        supabase
          .from("upkeep_dispensations")
          .select("id", { count: "exact", head: true })
          .eq("leader_id", leaderId)
          .eq("status", "disputed")
          .is("resolved_at", null),
        supabase
          .from("invite_codes")
          .select("id", { count: "exact", head: true })
          .eq("leader_id", leaderId)
          .not("used_by", "is", null)
          .gt("used_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);
      let unverified = 0;
      if (teamIds.length > 0) {
        const { count } = await supabase
          .from("bank_accounts")
          .select("user_id", { count: "exact", head: true })
          .in("user_id", teamIds)
          .is("verified_at", null);
        unverified = count ?? 0;
      }
      if (!cancelled) {
        setCounts((c) => ({
          ...c,
          disputedUpkeeps: disputed ?? 0,
          unverifiedBanks: unverified,
          pendingSignups: signups ?? 0,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaderId, teamIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips: Array<{
    key: keyof Counts;
    label: string;
    Icon: typeof Clock;
    tone: string;
    target: string;
  }> = [
    {
      key: "pendingRequests",
      label: "withdrawal requests",
      Icon: Clock,
      tone: "bg-warning/15 text-warning border-warning/30",
      target: "withdrawal-requests",
    },
    {
      key: "disputedUpkeeps",
      label: "disputed upkeeps",
      Icon: AlertTriangle,
      tone: "bg-destructive/15 text-destructive border-destructive/30",
      target: "upkeep-dispensations",
    },
    {
      key: "unverifiedBanks",
      label: "unverified bank accounts",
      Icon: ShieldCheck,
      tone: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      target: "team-members",
    },
    {
      key: "pendingSignups",
      label: "recent signups (7d)",
      Icon: Users,
      tone: "bg-primary/15 text-primary border-primary/30",
      target: "recent-signups",
    },
  ];

  const visible = chips.filter((c) => counts[c.key] > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card/60 p-3 shadow-card">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Needs attention
      </span>
      {visible.map((c) => (
        <button
          type="button"
          key={c.key}
          onClick={() => scrollTo(c.target)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-80 ${c.tone}`}
        >
          <c.Icon className="size-3.5" />
          <span className="font-mono">{counts[c.key]}</span> {c.label}
        </button>
      ))}
    </div>
  );
}
