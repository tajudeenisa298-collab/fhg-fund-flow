import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUsd } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

interface UpcomingPlan {
  amount_usd: number;
  next_run_at: string;
}

export function BalanceProjection({
  memberId,
  balanceUsd,
}: {
  memberId: string;
  balanceUsd: number | string;
}) {
  const { profile } = useAuth();
  const [next, setNext] = useState<UpcomingPlan | null>(null);

  useEffect(() => {
    supabase
      .from("upkeep_plans")
      .select("amount_usd, next_run_at")
      .eq("member_id", memberId)
      .eq("active", true)
      .order("next_run_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setNext((data as UpcomingPlan) ?? null));
  }, [memberId]);

  if (!next) return null;

  const when = new Date(next.next_run_at);
  const projected = Number(balanceUsd) + Number(next.amount_usd);
  const dayLabel = when.toLocaleDateString(profile?.locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <CalendarClock className="size-4" />
      </div>
      <div className="min-w-0 text-sm">
        <p>
          <span className="font-medium">After your next upkeep</span>{" "}
          <span className="text-muted-foreground">({dayLabel})</span>{" "}
          you'll have <span className="font-semibold">{fmtUsd(projected, profile?.locale)}</span>.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scheduled credit of {fmtUsd(next.amount_usd, profile?.locale)} from your leader.
        </p>
      </div>
    </div>
  );
}
