import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, TrendingUp, Users, PieChart as PieIcon, Calendar } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtUsd } from "@/lib/format";
import { RANKS } from "@/lib/ranks";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — FHG Funds" },
      { name: "description", content: "Trends, contributors, cohorts and expense breakdowns." },
    ],
  }),
  component: AnalyticsPage,
});

type Txn = {
  id: string;
  member_id: string;
  type: string;
  amount_usd: number | string;
  created_at: string;
};
type OfficeRow = {
  id: string;
  kind: string;
  amount_ngn: number | string;
  category: string | null;
  created_at: string;
};
type ProfileLite = {
  id: string;
  full_name: string;
  rank: string;
  balance_usd: number | string;
  created_at: string;
  terminated_at: string | null;
  finalized_at: string | null;
};

// Expanded distinct palette so adjacent pie slices and bars never share a hue.
const COLORS = [
  "hsl(217 91% 60%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(160 65% 45%)",
  "hsl(15 86% 56%)",
  "hsl(199 89% 48%)",
  "hsl(48 96% 53%)",
  "hsl(330 81% 60%)",
  "hsl(258 90% 66%)",
  "hsl(94 56% 45%)",
  "hsl(20 70% 50%)",
  "hsl(189 94% 43%)",
  "hsl(310 70% 55%)",
];

function monthKey(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}
function dayKey(d: string) {
  return new Date(d).toISOString().slice(0, 10);
}

function AnalyticsPage() {
  const {
    session,
    profile,
    roles,
    loading,
    fundHandlerMfaRequired,
    fundHandlerMfaSetupRequired,
  } = useAuth();
  const nav = useNavigate();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [office, setOffice] = useState<OfficeRow[]>([]);
  const [team, setTeam] = useState<ProfileLite[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
    if (!loading && profile && !roles.includes("leader")) nav({ to: "/dashboard" });
    if (!loading && profile && (fundHandlerMfaRequired || fundHandlerMfaSetupRequired)) {
      nav({ to: "/dashboard" });
    }
  }, [loading, session, profile, roles, fundHandlerMfaRequired, fundHandlerMfaSetupRequired, nav]);

  useEffect(() => {
    if (!profile?.id) return;
    setBusy(true);
    Promise.all([
      supabase
        .from("transactions")
        .select("id, member_id, type, amount_usd, created_at")
        .eq("leader_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("office_ledger").select("id, kind, amount_ngn, category, created_at").eq("leader_id", profile.id),
      supabase
        .from("profiles")
        .select("id, full_name, rank, balance_usd, created_at, terminated_at, finalized_at")
        .eq("leader_id", profile.id),
    ]).then(([{ data: t }, { data: o }, { data: p }]) => {
      setTxns((t as Txn[]) ?? []);
      setOffice((o as OfficeRow[]) ?? []);
      setTeam((p as ProfileLite[]) ?? []);
      setBusy(false);
    });
    // Only re-fetch when the actual user id changes, not on every auth-context
    // refresh (which re-creates the `profile` object identity and used to
    // cause the whole Analytics page to flicker / "refresh" periodically).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  /** Daily series for last 60 days */
  const series = useMemo(() => {
    const days = new Map<string, { day: string; deposits: number; withdrawals: number; fees: number }>();
    const cutoff = Date.now() - 60 * 86400_000;
    for (const t of txns) {
      const ts = new Date(t.created_at).getTime();
      if (ts < cutoff) continue;
      const k = dayKey(t.created_at);
      const row = days.get(k) ?? { day: k, deposits: 0, withdrawals: 0, fees: 0 };
      const amt = Math.abs(Number(t.amount_usd) || 0);
      if (t.type === "deposit") row.deposits += amt;
      else if (t.type === "withdrawal") row.withdrawals += amt;
      else if (t.type === "bank_fee") row.fees += amt;
      days.set(k, row);
    }
    return Array.from(days.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [txns]);

  /** Top contributors by net deposits (gross deposits minus bank fees per member) */
  const topContrib = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txns) {
      const amt = Math.abs(Number(t.amount_usd) || 0);
      if (t.type === "deposit") {
        m.set(t.member_id, (m.get(t.member_id) ?? 0) + amt);
      } else if (t.type === "bank_fee") {
        m.set(t.member_id, (m.get(t.member_id) ?? 0) - amt);
      }
    }
    const lookup = new Map(team.map((p) => [p.id, p.full_name]));
    return Array.from(m.entries())
      .map(([id, total]) => ({ id, name: lookup.get(id) ?? "Unknown", total }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [txns, team]);

  /** Churn */
  const churn = useMemo(() => {
    const total = team.length || 1;
    const terminated = team.filter((m) => !!m.terminated_at).length;
    const finalized = team.filter((m) => !!m.finalized_at).length;
    const active = team.length - terminated - finalized;
    return {
      total: team.length,
      active,
      terminated,
      finalized,
      churnPct: ((terminated + finalized) / total) * 100,
    };
  }, [team]);

  /** Avg balance by rank */
  const avgByRank = useMemo(() => {
    const buckets = new Map<string, { rank: string; sum: number; count: number }>();
    for (const m of team) {
      const r = m.rank || "Member";
      const b = buckets.get(r) ?? { rank: r, sum: 0, count: 0 };
      b.sum += Number(m.balance_usd) || 0;
      b.count += 1;
      buckets.set(r, b);
    }
    return RANKS.map((r) => {
      const b = buckets.get(r);
      return { rank: r, avg: b ? b.sum / Math.max(b.count, 1) : 0, count: b?.count ?? 0 };
    }).filter((x) => x.count > 0);
  }, [team]);

  /** Cohort retention by signup month */
  const cohorts = useMemo(() => {
    const map = new Map<string, { signed: number; active: number; left: number }>();
    for (const m of team) {
      const k = monthKey(m.created_at);
      const c = map.get(k) ?? { signed: 0, active: 0, left: 0 };
      c.signed += 1;
      if (m.terminated_at || m.finalized_at) c.left += 1;
      else c.active += 1;
      map.set(k, c);
    }
    return Array.from(map.entries())
      .map(([month, v]) => ({
        month,
        signed: v.signed,
        active: v.active,
        retention: (v.active / Math.max(v.signed, 1)) * 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [team]);

  /** Office expense categories */
  const expCategories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of office) {
      if (r.kind !== "expense_out") continue;
      const k = (r.category && r.category.trim()) || "Uncategorised";
      m.set(k, (m.get(k) ?? 0) + Number(r.amount_ngn));
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [office]);

  /** Office expense monthly trend */
  const expMonthly = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of office) {
      if (r.kind !== "expense_out") continue;
      const k = monthKey(r.created_at);
      m.set(k, (m.get(k) ?? 0) + Number(r.amount_ngn));
    }
    return Array.from(m.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [office]);

  // Hide content for non-leaders while the redirect runs to avoid a flash.
  const isAllowed =
    !!session &&
    roles.includes("leader") &&
    !fundHandlerMfaRequired &&
    !fundHandlerMfaSetupRequired;
  if (loading || busy || !isAllowed) {
    return (
      <div className="min-h-screen bg-gradient-soft p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" asChild aria-label="Back">
              <Link to="/dashboard"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Analytics</h1>
              <p className="text-xs text-muted-foreground">Trends, contributors, cohorts, expenses</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
        {/* Time series */}
        <section className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="size-4 text-primary" /> Cash flow (last 60 days)
          </h2>
          <div className="mt-4 h-64">
            {series.length === 0 ? (
              <EmptyHint label="No transactions in the last 60 days yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => fmtUsd(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="deposits" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="withdrawals" stroke={COLORS[3]} fill={COLORS[3]} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="fees" stroke={COLORS[2]} fill={COLORS[2]} fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top contributors */}
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-primary" /> Top contributors
            </h2>
            <div className="mt-4 h-64">
              {topContrib.length === 0 ? (
                <EmptyHint label="No deposits yet." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topContrib} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmtUsd(v)} />
                    <Bar dataKey="total" fill={COLORS[0]} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Avg balance per rank */}
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-primary" /> Avg balance per rank
            </h2>
            <div className="mt-4 h-64">
              {avgByRank.length === 0 ? (
                <EmptyHint label="No team members yet." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avgByRank}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="rank" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number) => fmtUsd(v)} />
                    <Bar dataKey="avg" fill={COLORS[5]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>

        {/* Churn */}
        <section className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-primary" /> Churn
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total members" value={String(churn.total)} />
            <Stat label="Active" value={String(churn.active)} />
            <Stat label="Terminated" value={String(churn.terminated)} tone="bad" />
            <Stat label="Churn rate" value={`${churn.churnPct.toFixed(1)}%`} tone={churn.churnPct > 20 ? "bad" : "muted"} />
          </div>
        </section>

        {/* Cohorts */}
        <section className="rounded-2xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="size-4 text-primary" /> Cohort retention by signup month
          </h2>
          {cohorts.length === 0 ? (
            <div className="mt-4 h-32"><EmptyHint label="No cohorts yet." /></div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2">Cohort</th>
                    <th>Signed up</th>
                    <th>Still active</th>
                    <th className="text-right">Retention</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cohorts.map((c) => (
                    <tr key={c.month}>
                      <td className="py-2 font-medium">{c.month}</td>
                      <td>{c.signed}</td>
                      <td>{c.active}</td>
                      <td className="text-right">
                        <span className={c.retention >= 80 ? "text-success" : c.retention >= 50 ? "" : "text-destructive"}>
                          {c.retention.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Office expense categories pie */}
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <PieIcon className="size-4 text-primary" /> Office expenses by category (NGN)
            </h2>
            <div className="mt-4 h-64">
              {expCategories.length === 0 ? (
                <EmptyHint label="No office expenses logged." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expCategories} dataKey="value" nameKey="name" outerRadius={90} label>
                      {expCategories.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Office monthly trend */}
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-primary" /> Office expenses by month (NGN)
            </h2>
            <div className="mt-4 h-64">
              {expMonthly.length === 0 ? (
                <EmptyHint label="No office expenses logged." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={expMonthly}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₦${v.toLocaleString()}`} />
                    <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                    <Line type="monotone" dataKey="total" stroke={COLORS[0]} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{label}</div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "muted" }) {
  const cls =
    tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${cls}`}>{value}</p>
    </div>
  );
}
