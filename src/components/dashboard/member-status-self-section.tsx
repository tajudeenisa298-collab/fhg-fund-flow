import { useEffect, useState } from "react";
import { ShieldAlert, Ban, CheckCircle2, Lock, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";

type Action = "suspended" | "terminated" | "pardoned" | "finalized";
interface LogRow {
  id: string;
  action: Action;
  reason: string | null;
  effective_until: string | null;
  created_at: string;
}

const ICON: Record<Action, typeof ShieldAlert> = {
  suspended: ShieldAlert,
  terminated: Ban,
  pardoned: CheckCircle2,
  finalized: Lock,
};

const TONE: Record<Action, string> = {
  suspended: "text-amber-600",
  terminated: "text-destructive",
  pardoned: "text-emerald-600",
  finalized: "text-muted-foreground",
};

export function MemberStatusSelfSection({ memberId }: { memberId: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("member_status_log")
        .select("id,action,reason,effective_until,created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) {
        setRows((data as LogRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Your account history</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Suspensions, terminations, and pardons recorded by your leader.
      </p>
      <ul className="divide-y">
        {rows.map((r) => {
          const Icon = ICON[r.action];
          const indefinite =
            r.action === "suspended" &&
            r.effective_until &&
            new Date(r.effective_until).getUTCFullYear() >= 9000;
          return (
            <li key={r.id} className="flex items-start gap-3 py-3">
              <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[r.action]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="capitalize font-medium">{r.action}</span>
                  {r.effective_until && (
                    <span className="text-muted-foreground">
                      {indefinite
                        ? " · indefinite"
                        : ` · until ${fmtDate(r.effective_until)}`}
                    </span>
                  )}
                </p>
                {r.reason && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>
                )}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {fmtDate(r.created_at)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
