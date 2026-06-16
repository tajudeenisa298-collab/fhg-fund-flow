import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import {
  Users,
  Wallet,
  Plus,
  ArrowUpRight,
  BadgeCheck,
  Clock,
  Pause,
  Play,
  Trash2,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth-context";
import { fmtUsd, fmtNgn, fmtDate } from "@/lib/format";
import { Money } from "@/components/money";
import {
  FREQ_LABEL,
  type UpkeepFrequency,
  type UpkeepPlan,
  type WithdrawalRequest,
  type OfficeLedgerEntry,
  type LeaderPurseEntry,
  type RankUpkeepDefault,
} from "@/lib/types";
import { RANKS, isDirectorOrAbove, rankIndex } from "@/lib/ranks";
import { DispenseUpkeepDialog } from "@/components/dashboard/dispense-upkeep-dialog";

import { CurrencyAmountInput } from "@/components/currency-amount-input";
import { StatCard } from "@/components/dashboard/stat-card";
import { InviteCodeRow, type InviteCodeRowData } from "@/components/dashboard/invite-code-row";
import { MemberDetailDialog } from "@/components/dashboard/member-detail-dialog";
import { FundRulesSection } from "@/components/dashboard/fund-rules-section";
import { OfficeSection } from "@/components/dashboard/office-section";
import { LeaderPurseSection } from "@/components/dashboard/leader-purse-section";
import { DownlineSection } from "@/components/dashboard/downline-section";
import { RankUpkeepDefaultsSection } from "@/components/dashboard/rank-upkeep-defaults-section";
import { OrganisationSection } from "@/components/dashboard/organisation-section";
import { PvLogSection } from "@/components/dashboard/pv-log-section";
import { LeaderDispensationsSection } from "@/components/dashboard/leader-dispensations-section";
import { AnnouncementsSection } from "@/components/dashboard/announcements-section";
import { ResourceLibrarySection } from "@/components/dashboard/resource-library-section";
import { usePagedList, ShowMoreButton } from "@/components/paged-list";


import { generateInviteCode, promoteManagedMember } from "@/lib/team.functions";

export function LeaderView({ profile }: { profile: Profile }) {
  const { refresh, ngnRate } = useAuth();
  const createInviteCode = useServerFn(generateInviteCode);
  const [team, setTeam] = useState<Profile[]>([]);
  const [codes, setCodes] = useState<InviteCodeRowData[]>([]);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [plans, setPlans] = useState<UpkeepPlan[]>([]);
  const [tick, setTick] = useState(0); // periodic re-render to drop expired codes
  const [detailMember, setDetailMember] = useState<Profile | null>(null);
  const [office, setOffice] = useState<OfficeLedgerEntry[]>([]);
  const [purse, setPurse] = useState<LeaderPurseEntry[]>([]);
  const [rankDefaults, setRankDefaults] = useState<RankUpkeepDefault[]>([]);

  const load = useCallback(async () => {
    const [{ data: t }, { data: c }, { data: r }, { data: p }, { data: o }, { data: pu }, { data: rd }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
        supabase.from("invite_codes").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
        supabase.from("withdrawal_requests").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
        supabase.from("upkeep_plans").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
        supabase.from("office_ledger").select("*").eq("leader_id", profile.id),
        supabase.from("leader_purse_ledger").select("*").eq("leader_id", profile.id),
        supabase.from("rank_upkeep_defaults").select("*").eq("leader_id", profile.id).order("rank"),
      ]);
    setTeam((t as Profile[]) ?? []);
    setCodes((c as InviteCodeRowData[]) ?? []);
    setRequests((r as WithdrawalRequest[]) ?? []);
    setPlans((p as UpkeepPlan[]) ?? []);
    setOffice((o as OfficeLedgerEntry[]) ?? []);
    setPurse((pu as LeaderPurseEntry[]) ?? []);
    setRankDefaults((rd as RankUpkeepDefault[]) ?? []);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: refresh dashboard when any related row changes
  useEffect(() => {
    const ch = supabase
      .channel(`leader-dash:${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invite_codes", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "upkeep_plans", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "office_ledger", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "leader_purse_ledger", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "rank_upkeep_defaults", filter: `leader_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id, load]);

  const totalManaged = team.reduce((s, m) => s + Number(m.balance_usd), 0);
  const totalDebts = team.reduce((s, m) => (Number(m.balance_usd) < 0 ? s + Math.abs(Number(m.balance_usd)) : s), 0);
  const totalCredits = team.reduce((s, m) => (Number(m.balance_usd) > 0 ? s + Number(m.balance_usd) : s), 0);
  const officeIn = office.filter((r) => r.kind === "support_in").reduce((s, r) => s + Number(r.amount_ngn), 0);
  const officeOut = office.filter((r) => r.kind === "expense_out").reduce((s, r) => s + Number(r.amount_ngn), 0);
  const officeBalNgn = officeIn - officeOut;
  const purseCredit = purse.filter((r) => r.kind === "credit").reduce((s, r) => s + Number(r.amount_usd), 0);
  const purseDebit = purse.filter((r) => r.kind === "debit").reduce((s, r) => s + Number(r.amount_usd), 0);
  const purseBal = purseCredit - purseDebit;
  const visibleCodes = useMemo(
    () =>
      codes.filter(
        (c) => !c.used_by && !c.revoked && new Date(c.expires_at).getTime() > Date.now(),
      ),
    [codes, tick],
  );
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const resolvedRequests = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  );
  const resolvedPage = usePagedList(resolvedRequests, 8);

  const generateCode = async () => {
    try {
      await createInviteCode();
      toast.success("Invite code created — valid for 2 minutes");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create invite code");
    }
  };



  const memberById = (id: string) => team.find((m) => m.id === id);

  const rankLabel = isDirectorOrAbove(profile.rank) ? profile.rank : "Team Leader";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hello, {rankLabel} {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">Manage your team's funds and requests.</p>
        </div>
        <NgnRateButton currentRate={ngnRate} onSaved={refresh} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total members" value={String(team.length)} icon={Users} />
        <StatCard
          label="Total funds held"
          valueNode={<Money usd={totalManaged - totalDebts} size="lg" />}
          icon={Wallet}
          hint={totalDebts > 0 ? `Net of ${fmtUsd(totalDebts)} debts` : undefined}
        />
        <StatCard
          label="Total credit balance"
          valueNode={<Money usd={totalCredits} size="lg" />}
          icon={ArrowUpRight}
        />
        <StatCard
          label="Total debts"
          valueNode={<Money usd={totalDebts} size="lg" />}
          icon={ArrowUpRight}
        />
        <StatCard
          label="Office support"
          value={fmtNgn(officeBalNgn / Math.max(ngnRate, 1), ngnRate)}
          icon={Wallet}
          hint={`In ${fmtNgn(officeIn / Math.max(ngnRate, 1), ngnRate)} · Out ${fmtNgn(officeOut / Math.max(ngnRate, 1), ngnRate)}`}
        />
        <StatCard
          label="Office expenses"
          value={fmtNgn(officeOut / Math.max(ngnRate, 1), ngnRate)}
          icon={ArrowUpRight}
        />
        <StatCard
          label="Team leader balance"
          valueNode={<Money usd={purseBal} size="lg" />}
          icon={Wallet}
        />
        <StatCard
          label="Total expenses"
          valueNode={<Money usd={purseDebit + officeOut / Math.max(ngnRate, 1)} size="lg" />}
          icon={ArrowUpRight}
          hint={`Withdrawals + office`}
        />
        <StatCard label="Pending requests" value={String(pendingRequests.length)} icon={Plus} />
        <StatCard label="Active codes" value={String(visibleCodes.length)} icon={Plus} />
      </div>

      {/* Pending requests */}
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold">Withdrawal requests</h2>
        <p className="text-sm text-muted-foreground">Review and approve or decline.</p>
        <div className="mt-4 divide-y rounded-xl border">
          {pendingRequests.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No pending requests.
            </p>
          )}
          {pendingRequests.map((r) => {
            const m = memberById(r.member_id);
            return (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m?.full_name ?? "Member"} · {fmtUsd(r.amount_usd)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({fmtNgn(r.amount_usd, ngnRate)})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
                </div>
                <ApproveDialog
                  request={r}
                  member={m ?? null}
                  memberBalance={Number(m?.balance_usd ?? 0)}
                  defaultRate={ngnRate}
                  onDone={async () => {
                    await load();
                    await refresh();
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>


      {/* Resolved history */}
      {resolvedRequests.length > 0 && (
        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <h2 className="text-base font-semibold">Recent decisions</h2>
          <ul className="mt-4 divide-y rounded-xl border">
            {resolvedPage.slice.map((r) => {
                const m = memberById(r.member_id);
                return (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {m?.full_name ?? "Member"} · {fmtUsd(r.amount_usd)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({fmtNgn(r.amount_usd, ngnRate)})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(r.resolved_at ?? r.created_at)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        r.status === "approved"
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {r.status}
                    </span>
                  </li>
                );
              })}
            <ShowMoreButton
              hasMore={resolvedPage.hasMore}
              onClick={resolvedPage.showMore}
              remaining={resolvedPage.total - resolvedPage.visible}
            />
          </ul>
        </section>
      )}

      {/* Team */}
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Team members</h2>
            <p className="text-sm text-muted-foreground">
              Add deposits, schedule upkeep, or change rank.
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          {team.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No members yet. Generate an invite code to get started.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {team.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer transition hover:bg-muted/40"
                    onClick={() => setDetailMember(m)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-primary hover:underline">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div>{m.rank}</div>
                      {m.can_handle_funds && !isDirectorOrAbove(m.rank) && (
                        <span className="text-[10px] uppercase tracking-wide text-success">
                          fund handler
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money usd={m.balance_usd} size="sm" className="items-end" />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap justify-end gap-2">
                        <DepositDialog member={m} leaderId={profile.id} onDone={load} />
                        <DeductDialog member={m} leaderId={profile.id} onDone={load} />
                        <DispenseUpkeepDialog member={m} leaderId={profile.id} onDone={load} />
                        <UpkeepDialog

                          member={m}
                          leaderId={profile.id}
                          existing={plans.find((p) => p.member_id === m.id) ?? null}
                          rankDefault={rankDefaults.find((rd) => rd.rank === m.rank) ?? null}
                          onDone={load}
                        />
                        <PromoteDialog member={m} onDone={load} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Upkeep schedules summary */}
      {plans.length > 0 && (
        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <h2 className="text-base font-semibold">Upkeep schedules</h2>
          <p className="text-sm text-muted-foreground">Recurring stipends to your members.</p>
          <ul className="mt-4 divide-y rounded-xl border">
            {plans.map((p) => {
              const m = memberById(p.member_id);
              return (
                <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {m?.full_name ?? "Member"} · {fmtUsd(p.amount_usd)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({fmtNgn(p.amount_usd, ngnRate)})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {FREQ_LABEL[p.frequency]}
                      {p.frequency === "custom_days" && p.custom_days
                        ? ` · every ${p.custom_days} days`
                        : ""}{" "}
                      · next {fmtDate(p.next_run_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={p.active ? "Pause" : "Resume"}
                      onClick={async () => {
                        const { error } = await supabase
                          .from("upkeep_plans")
                          .update({ active: !p.active })
                          .eq("id", p.id);
                        if (error) return toast.error(error.message);
                        toast.success(p.active ? "Plan paused" : "Plan resumed");
                        load();
                      }}
                    >
                      {p.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      onClick={async () => {
                        const { error } = await supabase.from("upkeep_plans").delete().eq("id", p.id);
                        if (error) return toast.error(error.message);
                        toast.success("Plan deleted");
                        load();
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Invite codes */}
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Invite codes</h2>
            <p className="text-sm text-muted-foreground">
              Each code expires in 2 minutes — share quickly!
            </p>
          </div>
          <Button onClick={generateCode}>
            <Plus className="mr-1 size-4" /> Generate code
          </Button>
        </div>
        <div className="mt-4 divide-y rounded-xl border">
          {visibleCodes.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No active codes. Generate one to onboard a new member.
            </p>
          )}
          {visibleCodes.map((c) => (
            <InviteCodeRow key={c.id} code={c} onExpired={() => setTick((t) => t + 1)} />
          ))}
        </div>
      </section>

      {/* Office support ledger */}
      <OfficeSection leaderId={profile.id} />

      {/* Team leader's personal purse */}
      <LeaderPurseSection leaderId={profile.id} />

      {/* Upkeep dispensations tracker */}
      <LeaderDispensationsSection leaderId={profile.id} />


      {/* Cross-team oversight: visible only when there are sub-leaders in the downline */}
      <OrganisationSection leaderId={profile.id} />

      {/* Team NeoLife PV log */}
      <PvLogSection ownerId={profile.id} scope="team" />


      {/* Pyramid downline */}
      <DownlineSection rootId={profile.id} />


      {/* Flexible fund rules */}
      <FundRulesSection leaderId={profile.id} />

      {/* Rank-based upkeep defaults */}
      <RankUpkeepDefaultsSection
        leaderId={profile.id}
        defaults={rankDefaults}
        onChanged={load}
      />

      <MemberDetailDialog
        member={detailMember}
        open={!!detailMember}
        onOpenChange={(v) => !v && setDetailMember(null)}
      />
    </div>
  );
}

/* ─── NGN rate editor ─── */

function NgnRateButton({
  currentRate,
  onSaved,
}: {
  currentRate: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(String(currentRate));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(rate);
    if (!(n > 0)) return toast.error("Rate must be positive");
    setBusy(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ usd_to_ngn: n, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Exchange rate updated");
    setOpen(false);
    onSaved();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SettingsIcon className="mr-1.5 size-3.5" />₦ {currentRate}/USD
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>USD → NGN exchange rate</DialogTitle>
            <DialogDescription>
              All NGN displays across the app use this rate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rate-edit">Naira per 1 USD</Label>
            <Input
              id="rate-edit"
              type="number"
              step="1"
              min="1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Deposit dialog ─── */

const depositSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  note: z.string().trim().max(200).optional(),
});

function DepositDialog({
  member,
  leaderId,
  onDone,
}: {
  member: Profile;
  leaderId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const grossUsd = Number(amount) > 0 ? Number(amount) : 0;
  const feeUsd = Number(fee) > 0 ? Number(fee) : 0;
  const netUsd = Math.max(0, grossUsd - feeUsd);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(grossUsd > 0)) return toast.error("Enter a valid amount");
    setBusy(true);
    void leaderId;
    const { data: depId, error } = await supabase.rpc("create_managed_transaction", {
      _member_id: member.id,
      _type: "deposit",
      _amount_usd: Number(grossUsd.toFixed(2)),
      _currency: "USD",
      _note: note.trim() || undefined,
    });
    if (error) { setBusy(false); return toast.error(error.message); }
    if (feeUsd > 0 && depId) {
      await supabase.rpc("create_managed_transaction", {
        _member_id: member.id,
        _type: "bank_fee",
        _amount_usd: Number(feeUsd.toFixed(2)),
        _currency: "USD",
        _note: `Bank fee on $${amount}`,
        _parent_txn_id: depId as unknown as string,
      });
    }
    setBusy(false);
    toast.success(`Deposit recorded · net ${fmtUsd(netUsd)}`);
    setOpen(false); setAmount(""); setFee(""); setNote("");
    onDone();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Deposit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add deposit for {member.full_name}</DialogTitle>
            <DialogDescription>This adds to their managed balance.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dep-amount">Gross deposit (USD)</Label>
              <Input id="dep-amount" type="number" step="0.01" min="0.01"
                value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dep-fee">Bank fee (USD, optional)</Label>
              <Input id="dep-fee" type="number" step="0.01" min="0"
                value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
              Net to member: <span className="font-mono font-semibold">{fmtUsd(netUsd)}</span>
              {feeUsd > 0 && <> · fee {fmtUsd(feeUsd)}</>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dep-note">Note (optional)</Label>
              <Input id="dep-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Recording…" : "Record deposit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Upkeep dialog ─── */

function UpkeepDialog({
  member,
  leaderId,
  existing,
  rankDefault,
  onDone,
}: {
  member: Profile;
  leaderId: string;
  existing: UpkeepPlan | null;
  rankDefault: RankUpkeepDefault | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initialAmountUsd = existing
    ? Number(existing.amount_usd)
    : rankDefault
      ? Number(rankDefault.amount_usd)
      : 0;
  const initialFreq: UpkeepFrequency =
    existing?.frequency ?? rankDefault?.frequency ?? "weekly";
  const initialDays = existing?.custom_days
    ? String(existing.custom_days)
    : rankDefault?.custom_days
      ? String(rankDefault.custom_days)
      : "5";
  const [amountUsd, setAmountUsd] = useState<number>(initialAmountUsd);
  const [freq, setFreq] = useState<UpkeepFrequency>(initialFreq);
  const [customDays, setCustomDays] = useState(initialDays);
  const [busy, setBusy] = useState(false);

  const applyRankDefault = () => {
    if (!rankDefault) return;
    setAmountUsd(Number(rankDefault.amount_usd));
    setFreq(rankDefault.frequency);
    if (rankDefault.custom_days) setCustomDays(String(rankDefault.custom_days));
    toast.success(`Prefilled from ${member.rank} default`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(amountUsd > 0)) return toast.error("Enter a valid amount");
    if (freq === "custom_days" && !(Number(customDays) > 0))
      return toast.error("Enter a valid day count");
    setBusy(true);
    const payload = {
      leader_id: leaderId,
      member_id: member.id,
      amount_usd: Number(amountUsd.toFixed(4)),
      frequency: freq,
      custom_days: freq === "custom_days" ? Number(customDays) : null,
    };
    const { error } = existing
      ? await supabase.from("upkeep_plans").update(payload).eq("id", existing.id)
      : await supabase.from("upkeep_plans").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Upkeep updated" : "Upkeep scheduled");
    setOpen(false);
    onDone();
  };


  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Clock className="mr-1 size-3.5" /> {existing ? "Upkeep" : "Set upkeep"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upkeep for {member.full_name}</DialogTitle>
            <DialogDescription>
              Recurring stipend deposited to their managed balance.
              {rankDefault && (
                <> Defaults for <b>{member.rank}</b>: {fmtUsd(rankDefault.amount_usd)} · {FREQ_LABEL[rankDefault.frequency]}.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {rankDefault && (
              <Button type="button" variant="outline" size="sm" onClick={applyRankDefault}>
                Prefill from {member.rank} default
              </Button>
            )}
            <div className="space-y-2">
              <Label htmlFor="up-amount">Amount per cycle</Label>
              <CurrencyAmountInput
                id="up-amount"
                valueUsd={amountUsd}
                onUsdChange={setAmountUsd}
              />
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={freq} onValueChange={(v) => setFreq(v as UpkeepFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQ_LABEL) as UpkeepFrequency[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {FREQ_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {freq === "custom_days" && (
              <div className="space-y-2">
                <Label htmlFor="up-days">Every N days</Label>
                <Input
                  id="up-days"
                  type="number"
                  min="1"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : existing ? "Update plan" : "Create plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Promote dialog (any rank) ─── */

function PromoteDialog({ member, onDone }: { member: Profile; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const currentIdx = Math.max(0, rankIndex(member.rank));
  const [newRank, setNewRank] = useState<string>(RANKS[Math.min(currentIdx + 1, RANKS.length - 1)]);
  const [grant, setGrant] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const promote = useServerFn(promoteManagedMember);

  const willBecomeDirector = isDirectorOrAbove(newRank);

  const submit = async () => {
    setBusy(true);
    const { error } = await promote({ data: { memberId: member.id, newRank, grantFundHandler: grant, note } })
      .then(() => ({ error: null as string | null }))
      .catch((e) => ({ error: e instanceof Error ? e.message : "Could not update rank" }));
    setBusy(false);
    if (error) return toast.error(error);
    toast.success(`${member.full_name} → ${newRank}`);
    setOpen(false);
    onDone();
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <BadgeCheck className="mr-1 size-3.5" /> Rank
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change rank for {member.full_name}</DialogTitle>
            <DialogDescription>Currently {member.rank}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New rank</Label>
              <Select value={newRank} onValueChange={setNewRank}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANKS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!willBecomeDirector && (
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={grant}
                  onCheckedChange={(v) => setGrant(Boolean(v))}
                  className="mt-0.5"
                />
                <span>
                  Allow this member to handle funds (grants leader access while keeping their lower
                  rank).
                </span>
              </label>
            )}

            {willBecomeDirector && (
              <p className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
                As a Director-tier rank they'll manage their own team. Their managed balance
                ({fmtUsd(member.balance_usd)}) will be released.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="promo-note">Note (optional)</Label>
              <Textarea
                id="promo-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Approve / decline dialog ─── */

const approveSchema = z.object({
  exchange_rate: z.number().positive(),
  currency: z.string().trim().min(2).max(8),
  local_amount: z.number().positive().optional(),
  note: z.string().trim().max(200).optional(),
});

function ApproveDialog({
  request,
  member,
  memberBalance,
  defaultRate,
  onDone,
}: {
  request: WithdrawalRequest;
  member: Profile | null;
  memberBalance: number;
  defaultRate: number;
  onDone: () => void;
}) {
  const [bank, setBank] = useState<{ bank_name: string; account_number: string; account_owner_name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("NGN");
  const [rate, setRate] = useState(String(defaultRate));
  const [note, setNote] = useState("");
  const [platformFee, setPlatformFee] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !member) return;
    supabase
      .from("bank_accounts")
      .select("bank_name, account_number, account_owner_name")
      .eq("user_id", member.id)
      .maybeSingle()
      .then(({ data }) => setBank(data ?? null));
  }, [open, member]);

  const feeUsd = Number(platformFee) > 0 ? Number(platformFee) : 0;
  const netUsd = Math.max(0, Number(request.amount_usd) - feeUsd);
  const localAmount = Number(rate) > 0 ? netUsd * Number(rate) : 0;

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = approveSchema.safeParse({
      exchange_rate: Number(rate),
      currency,
      local_amount: localAmount,
      note: note || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (Number(request.amount_usd) > memberBalance) {
      return toast.error("Member's balance is too low for this amount.");
    }
    if (feeUsd >= Number(request.amount_usd)) {
      return toast.error("Platform fee must be less than the withdrawal amount.");
    }
    setBusy(true);

    const { error: rpcErr } = await supabase.rpc("resolve_withdrawal_request", {
      _id: request.id,
      _status: "approved",
      _note: parsed.data.note ?? undefined,
      _currency: parsed.data.currency,
      _exchange_rate: parsed.data.exchange_rate,
      _local_amount: parsed.data.local_amount ?? undefined,
      _platform_fee_usd: feeUsd > 0 ? Number(feeUsd.toFixed(2)) : 0,
    });
    if (rpcErr) { setBusy(false); return toast.error(rpcErr.message); }

    setBusy(false);
    toast.success("Withdrawal approved & recorded");
    setOpen(false);
    onDone();
  };


  const decline = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("resolve_withdrawal_request", {
      _id: request.id,
      _status: "declined",
      _note: note || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request declined");
    setOpen(false);
    onDone();
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Review
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review withdrawal · {fmtUsd(request.amount_usd)}</DialogTitle>
            <DialogDescription>"{request.description}"</DialogDescription>
          </DialogHeader>
          {member && (
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="font-medium text-foreground">
                Pay via:{" "}
                <span className="text-primary">
                  {member.payout_method === "neolife_pv" ? "NeoLife PV credit" : "Bank transfer (NGN)"}
                </span>
              </p>
              {bank ? (
                <p className="text-muted-foreground">
                  {bank.bank_name} · <span className="font-mono">{bank.account_number}</span> ·{" "}
                  {bank.account_owner_name}
                </p>
              ) : (
                <p className="text-warning">No bank account on file.</p>
              )}
              {member.whatsapp_number && (
                <p className="text-muted-foreground">
                  WhatsApp:{" "}
                  <a
                    className="text-primary hover:underline"
                    href={`https://wa.me/${member.whatsapp_number.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {member.whatsapp_number}
                  </a>
                </p>
              )}
            </div>
          )}
          <form onSubmit={accept} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ccy">Currency paid in</Label>
                <Input
                  id="ccy"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">Exchange rate (per USD)</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pfee">Platform fee (USD, optional)</Label>
              <Input
                id="pfee"
                type="number"
                step="0.01"
                min="0"
                value={platformFee}
                onChange={(e) => setPlatformFee(e.target.value)}
                placeholder="e.g. 4 for Payoneer"
              />
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm space-y-1">
              <div>
                Net after fee:{" "}
                <span className="font-mono font-semibold">{fmtUsd(netUsd)}</span>
                {feeUsd > 0 && (
                  <span className="text-muted-foreground"> · fee {fmtUsd(feeUsd)}</span>
                )}
              </div>
              <div>
                Member receives ≈{" "}
                <span className="font-mono font-semibold">
                  {localAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lnote">Note (optional)</Label>
              <Textarea
                id="lnote"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reference, payout method…"
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={decline} disabled={busy}>
                Decline
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Approving…" : "Approve & record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Deduct dialog (fines / corrections) ─── */

const deductSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  reason: z.string().trim().min(2, "Reason is required").max(200),
});

function DeductDialog({
  member,
  leaderId,
  onDone,
}: {
  member: Profile;
  leaderId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amountUsd, setAmountUsd] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = deductSchema.safeParse({ amount: amountUsd, reason });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (parsed.data.amount > Number(member.balance_usd)) {
      return toast.error("Amount exceeds member's balance.");
    }
    setBusy(true);
    void leaderId;
    const { error } = await supabase.rpc("create_managed_transaction", {
      _member_id: member.id,
      _type: "fund_deduction",
      _amount_usd: Number(parsed.data.amount.toFixed(4)),
      _note: parsed.data.reason,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Deduction recorded — member notified");
    setOpen(false);
    setAmountUsd(0);
    setReason("");
    onDone();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Deduct
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deduct from {member.full_name}</DialogTitle>
            <DialogDescription>
              Reduces their managed balance. They'll receive a notification with your reason.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ded-amount">Amount</Label>
              <CurrencyAmountInput
                id="ded-amount"
                valueUsd={amountUsd}
                onUsdChange={setAmountUsd}
              />
              <p className="text-xs text-muted-foreground">
                Available: {fmtUsd(member.balance_usd)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ded-reason">Reason</Label>
              <Textarea
                id="ded-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Fine for missed meeting, correction, refund…"
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? "Recording…" : "Deduct"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
