import { useEffect, useRef, useState } from "react";
import { Shield, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";
import { removeRealtimeChannelsByTopicPrefix } from "@/lib/realtime";

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface MiniProfile {
  id: string;
  full_name: string;
}

/**
 * Read-only audit feed of leader actions taken on the current leader or on
 * anyone in their downline. RLS does the access control — we just render.
 */
export function AdminAuditFeed() {
  const channelId = useRef(crypto.randomUUID());
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (data as AuditRow[]) ?? [];
    setRows(list);

    const ids = Array.from(
      new Set(
        list
          .flatMap((r) => [r.actor_id, r.target_user_id])
          .filter((v): v is string => !!v),
      ),
    );
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map: Record<string, string> = {};
      ((profs as MiniProfile[]) ?? []).forEach((p) => {
        map[p.id] = p.full_name;
      });
      setPeople(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    removeRealtimeChannelsByTopicPrefix(supabase, "admin-audit-feed");
    const ch = supabase
      .channel(`admin-audit-feed:${channelId.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_audit_log" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) =>
        [
          r.action,
          people[r.actor_id ?? ""] ?? "",
          people[r.target_user_id ?? ""] ?? "",
          JSON.stringify(r.details ?? {}),
        ]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : rows;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Shield className="size-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Audit feed</h2>
            <p className="text-sm text-muted-foreground">
              Every privileged action you or other leaders have taken on your
              account and downline. Last 200 entries.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter action, person, detail…"
            className="h-9 w-[220px]"
          />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <ExportCsvButton
            filename="admin_audit_log"
            rows={filtered}
            getRow={(r) => ({
              date: fmtDate(r.created_at),
              action: r.action,
              actor: people[r.actor_id ?? ""] ?? r.actor_id ?? "system",
              target: people[r.target_user_id ?? ""] ?? r.target_user_id ?? "",
              target_id: r.target_id ?? "",
              details: JSON.stringify(r.details ?? {}),
            })}
          />
        </div>
      </div>

      <div className="mt-4 divide-y rounded-xl border">
        {loading && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Loading audit entries…
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No audit entries match.
          </p>
        )}
        {!loading &&
          filtered.map((r) => {
            const actor = people[r.actor_id ?? ""] ?? (r.actor_id ? "Unknown user" : "System");
            const target = r.target_user_id
              ? people[r.target_user_id] ?? "Unknown user"
              : null;
            return (
              <details key={r.id} className="group px-4 py-3">
                <summary className="flex flex-wrap items-center justify-between gap-3 list-none cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {r.action}
                      </span>{" "}
                      <span className="text-sm text-muted-foreground">by</span>{" "}
                      {actor}
                      {target && (
                        <>
                          <span className="text-sm text-muted-foreground"> · on </span>
                          {target}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
                  </div>
                  <span className="text-xs text-muted-foreground group-open:hidden">
                    View details
                  </span>
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
                  {JSON.stringify(r.details ?? {}, null, 2)}
                </pre>
              </details>
            );
          })}
      </div>
    </section>
  );
}
