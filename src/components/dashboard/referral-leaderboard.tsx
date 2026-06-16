import { useEffect, useState } from "react";
import { Trophy, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = { id: string; name: string; recruits: number; rank: string };

/**
 * Referral leaderboard — top sponsors in the leader's downline.
 * Uses the existing sponsor pyramid (profiles.sponsor_id).
 */
export function ReferralLeaderboard({ leaderId }: { leaderId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // 1. Direct team of this leader
      const { data: team } = await supabase
        .from("profiles")
        .select("id, full_name, rank")
        .eq("leader_id", leaderId);
      const teamRows = (team ?? []) as { id: string; full_name: string; rank: string }[];
      if (teamRows.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      // 2. Count direct sponsorships per teammate
      const ids = teamRows.map((m) => m.id);
      const { data: sponsored } = await supabase
        .from("profiles")
        .select("sponsor_id")
        .in("sponsor_id", ids);
      const counts = new Map<string, number>();
      for (const r of (sponsored ?? []) as { sponsor_id: string | null }[]) {
        if (!r.sponsor_id) continue;
        counts.set(r.sponsor_id, (counts.get(r.sponsor_id) ?? 0) + 1);
      }
      const ranked = teamRows
        .map((m) => ({ id: m.id, name: m.full_name, rank: m.rank, recruits: counts.get(m.id) ?? 0 }))
        .filter((r) => r.recruits > 0)
        .sort((a, b) => b.recruits - a.recruits)
        .slice(0, 10);
      setRows(ranked);
      setLoading(false);
    })();
  }, [leaderId]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Trophy className="size-4 text-warning" /> Referral leaderboard
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Members in your team who've sponsored the most new sign-ups.
      </p>
      <ol className="mt-4 divide-y rounded-xl border">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-3">
              <span className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                i === 0 ? "bg-warning/20 text-warning" :
                i === 1 ? "bg-muted text-foreground" :
                i === 2 ? "bg-warning/10 text-warning" : "bg-muted/60 text-muted-foreground"
              }`}>
                {i < 3 ? <Medal className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.rank}</p>
              </span>
            </span>
            <span className="font-mono text-sm font-semibold">{r.recruits}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
