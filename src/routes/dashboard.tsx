import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, LogOut, Copy, Plus, Users, TrendingUp } from "lucide-react";
import { useAuth, type Profile } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FHG Funds" },
      { name: "description", content: "Your funds, team, and activity at a glance." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session, profile, role, loading, signOut } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [loading, session, nav]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elegant">
              <Wallet className="size-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">FHG Funds</p>
              <p className="text-xs text-muted-foreground capitalize">{role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{profile.full_name}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                await signOut();
                nav({ to: "/" });
              }}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {role === "leader" ? <LeaderView profile={profile} /> : <MemberView profile={profile} />}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex size-9 items-center justify-center rounded-lg bg-accent">
          <Icon className="size-4 text-accent-foreground" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function MemberView({ profile }: { profile: Profile }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {profile.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">Here's your managed fund overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Managed balance" value={fmtUsd(profile.balance_usd)} icon={Wallet} hint="Held by your leader" />
        <StatCard label="Current rank" value={profile.rank} icon={TrendingUp} hint="Reach Director to release funds" />
        <StatCard label="Pending withdrawals" value="0" icon={TrendingUp} hint="Withdrawal flow coming next" />
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold">Transaction history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your deposits and withdrawals will appear here. The withdrawal request flow ships in the
          next phase.
        </p>
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        </div>
      </div>
    </div>
  );
}

interface InviteCode {
  id: string;
  code: string;
  created_at: string;
  used_by: string | null;
  revoked: boolean;
}

function LeaderView({ profile }: { profile: Profile }) {
  const [team, setTeam] = useState<Profile[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from("profiles").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("invite_codes").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
    ]);
    setTeam((t as Profile[]) ?? []);
    setCodes((c as InviteCode[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [profile.id]);

  const totalManaged = team.reduce((s, m) => s + Number(m.balance_usd), 0);
  const activeCodes = codes.filter((c) => !c.used_by && !c.revoked).length;

  const generateCode = async () => {
    setCreating(true);
    const code = `FHG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await supabase.from("invite_codes").insert({ code, leader_id: profile.id });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invite code created");
    load();
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success(`Copied ${code}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, Director {profile.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">Manage your team and invite new recruits.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Team members" value={String(team.length)} icon={Users} />
        <StatCard label="Total funds managed" value={fmtUsd(totalManaged)} icon={Wallet} />
        <StatCard label="Active invite codes" value={String(activeCodes)} icon={Plus} />
      </div>

      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Invite codes</h2>
            <p className="text-sm text-muted-foreground">
              Share codes with new recruits to add them to your team.
            </p>
          </div>
          <Button onClick={generateCode} disabled={creating}>
            <Plus className="mr-1 size-4" /> Generate code
          </Button>
        </div>
        <div className="mt-4 divide-y rounded-xl border">
          {codes.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No codes yet. Generate one to invite your first member.
            </p>
          )}
          {codes.map((c) => {
            const status = c.revoked
              ? "Revoked"
              : c.used_by
                ? "Used"
                : "Active";
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm">{c.code}</code>
                  <span
                    className={`text-xs font-medium ${
                      status === "Active"
                        ? "text-success"
                        : status === "Used"
                          ? "text-muted-foreground"
                          : "text-destructive"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyCode(c.code)}
                  disabled={status !== "Active"}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold">Team members</h2>
        <p className="text-sm text-muted-foreground">Balances you currently manage.</p>
        <div className="mt-4 overflow-hidden rounded-xl border">
          {team.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No members yet. Share an invite code to get started.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 text-right font-medium">Managed balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {team.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">{m.rank}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtUsd(Number(m.balance_usd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// Helper input for name search (kept available for future filtering)
export const _Input = Input;
