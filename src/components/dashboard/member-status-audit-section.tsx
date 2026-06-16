import { useEffect, useState } from "react";
import { ShieldAlert, Ban, CheckCircle2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";

type Action = "suspended" | "terminated" | "pardoned" | "finalized";
interface LogRow {
  id: string;
  member_id: string;
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

export function MemberStatusAuditSection({
  leaderId,
  memberNames,
}: {
  leaderId: string;
  memberNames: Record<string, string>;
}) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (c: string, v: string) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: LogRow[] | null }>;
              };
            };
          };
        };
      })
        .from("member_status_log")
        .select("id,member_id,action,reason,effective_until,created_at")
        .eq("leader_id", leaderId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (!cancelled) {
        setRows(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaderId]);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Member status history</h2>
          <p className="text-xs text-muted-foreground">
            Audit trail of suspensions, terminations, and pardons.
          </p>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const Icon = ICON[r.action];
            return (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[r.action]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {memberNames[r.member_id] ?? "Member"}
                    </span>{" "}
                    <span className="capitalize text-muted-foreground">{r.action}</span>
                    {r.effective_until && (
                      <span className="text-muted-foreground">
                        {" "}· until {fmtDate(r.effective_until)}
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
      )}
    </section>
  );
}
