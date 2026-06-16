import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

interface Row {
  id: string;
  code: string;
  used_at: string | null;
  used_by: string | null;
  member_name?: string;
  member_email?: string;
}

export function RecentSignupsSection({ leaderId }: { leaderId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("invite_codes")
        .select("id, code, used_at, used_by")
        .eq("leader_id", leaderId)
        .not("used_by", "is", null)
        .gte("used_at", since)
        .order("used_at", { ascending: false })
        .limit(20);
      const list = (data as Row[]) ?? [];
      const ids = list.map((r) => r.used_by).filter(Boolean) as string[];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const map = new Map(
          (profs ?? []).map((p) => [
            p.id as string,
            { name: p.full_name as string, email: p.email as string },
          ]),
        );
        list.forEach((r) => {
          const m = r.used_by ? map.get(r.used_by) : undefined;
          r.member_name = m?.name;
          r.member_email = m?.email;
        });
      }
      if (!cancelled) {
        setRows(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaderId]);

  return (
    <section id="recent-signups" className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <UserPlus className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Recent signups</h2>
      </div>
      <p className="text-sm text-muted-foreground">Invite codes redeemed in the last 30 days.</p>
      <div className="mt-4 divide-y rounded-xl border">
        {loading ? (
          <div className="space-y-px">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No signups in the last 30 days.
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.member_name ?? "Member"}{" "}
                  {r.member_email && (
                    <span className="text-xs font-normal text-muted-foreground">
                      · {r.member_email}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Code <span className="font-mono">{r.code}</span> · {r.used_at ? fmtDate(r.used_at) : "—"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
