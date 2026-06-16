import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Ban, CheckCircle2, Lock, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
  suspended: "text-warning",
  terminated: "text-destructive",
  pardoned: "text-success",
  finalized: "text-muted-foreground",
};

const ACTIONS: { value: Action | "all"; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "suspended", label: "Suspensions" },
  { value: "terminated", label: "Terminations" },
  { value: "pardoned", label: "Pardons" },
  { value: "finalized", label: "Finalized" },
];

export function MemberStatusAuditSection({
  leaderId,
  memberNames,
}: {
  leaderId: string;
  memberNames: Record<string, string>;
}) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<Action | "all">("all");

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
        .limit(100);
      if (!cancelled) {
        setRows(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaderId]);

  const memberOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.member_id)));
    return ids.map((id) => ({ id, name: memberNames[id] ?? "Member" }));
  }, [rows, memberNames]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (memberFilter === "all" || r.member_id === memberFilter) &&
          (actionFilter === "all" || r.action === actionFilter),
      ),
    [rows, memberFilter, actionFilter],
  );

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Member status history</h2>
          <p className="text-xs text-muted-foreground">
            Audit trail of suspensions, terminations, and pardons.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as Action | "all")}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={memberFilter} onValueChange={setMemberFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="All members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {memberOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-3">
              <Skeleton className="size-4 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center">
          <History className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No status changes yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Suspensions, terminations, and pardons will appear here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No entries match the current filter.
        </p>
      ) : (
        <ul className="divide-y">
          {filtered.map((r) => {
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
                    <span className="font-medium">
                      {memberNames[r.member_id] ?? "Member"}
                    </span>{" "}
                    <span className="capitalize text-muted-foreground">{r.action}</span>
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
      )}
    </section>
  );
}
