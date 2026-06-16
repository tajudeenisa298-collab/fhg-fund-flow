import { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CronRow = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_end: string | null;
  last_status: string | null;
  last_return: string | null;
};

const LABELS: Record<string, string> = {
  "run-due-upkeep-every-minute": "Upkeep dispenser",
  "run-due-fund-rules-hourly": "Scheduled fund rules",
  "finalize-terminations-daily": "Termination finalizer",
};

function relative(ts: string | null) {
  if (!ts) return "never";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function CronHealthSection() {
  const [rows, setRows] = useState<CronRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_cron_health");
      if (cancelled) return;
      if (error) setErr(error.message);
      else setRows((data ?? []) as CronRow[]);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Scheduled jobs</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Last run for upkeep, fund rules, and termination cleanup.
      </p>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      <div className="mt-4 divide-y rounded-xl border">
        {rows === null && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {rows && rows.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No jobs scheduled.</p>
        )}
        {rows?.map((r) => {
          const ok = r.last_status === "succeeded" || (r.last_status === null && r.active);
          const stale =
            r.last_start &&
            (Date.now() - new Date(r.last_start).getTime()) / 60000 >
              (r.jobname.endsWith("daily") ? 60 * 26 : r.jobname.endsWith("hourly") ? 70 : 5);
          return (
            <div key={r.jobname} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {ok && !stale ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <AlertCircle className="size-4 text-warning" />
                  )}
                  <span className="text-sm font-medium">{LABELS[r.jobname] ?? r.jobname}</span>
                  {!r.active && (
                    <span className="text-xs rounded bg-muted px-1.5 py-0.5">disabled</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  schedule <span className="font-mono">{r.schedule}</span> · last run{" "}
                  {relative(r.last_start)}
                  {r.last_status ? ` · ${r.last_status}` : ""}
                </p>
                {r.last_return && r.last_status !== "succeeded" && (
                  <p className="mt-1 text-xs text-destructive break-words">{r.last_return}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
