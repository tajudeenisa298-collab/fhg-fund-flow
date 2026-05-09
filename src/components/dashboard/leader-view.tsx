import { useEffect, useMemo, useState, useCallback } from "react";
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
import {
  FREQ_LABEL,
  type UpkeepFrequency,
  type UpkeepPlan,
  type WithdrawalRequest,
} from "@/lib/types";
import { RANKS, isDirectorOrAbove, rankIndex } from "@/lib/ranks";
import { StatCard } from "@/components/dashboard/stat-card";
import { InviteCodeRow, type InviteCodeRowData } from "@/components/dashboard/invite-code-row";
import { MemberDetailDialog } from "@/components/dashboard/member-detail-dialog";
import { FundRulesSection } from "@/components/dashboard/fund-rules-section";

export function LeaderView({ profile }: { profile: Profile }) {
  const { refresh, ngnRate } = useAuth();
  const [team, setTeam] = useState<Profile[]>([]);
  const [codes, setCodes] = useState<InviteCodeRowData[]>([]);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [plans, setPlans] = useState<UpkeepPlan[]>([]);
  const [tick, setTick] = useState(0); // periodic re-render to drop expired codes
  const [detailMember, setDetailMember] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const [{ data: t }, { data: c }, { data: r }, { data: p }] = await Promise.all([
      supabase.from("profiles").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("invite_codes").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("withdrawal_requests").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("upkeep_plans").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
    ]);
    setTeam((t as Profile[]) ?? []);
    setCodes((c as InviteCodeRowData[]) ?? []);
    setRequests((r as WithdrawalRequest[]) ?? []);
    setPlans((p as UpkeepPlan[]) ?? []);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  const totalManaged = team.reduce((s, m) => s + Number(m.balance_usd), 0);
  const visibleCodes = useMemo(
    () =>
      codes.filter(
        (c) => !c.used_by && !c.revoked && new Date(c.expires_at).getTime() > Date.now(),
      ),
    [codes, tick],
  );
  const pendingRequests = requests.filter((r) => r.status === "pending");

  const generateCode = async () => {
    const code = `FHG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await supabase.from("invite_codes").insert({ code, leader_id: profile.id });
    if (error) return toast.error(error.message);
    toast.success("Invite code created — valid for 20 minutes");
    load();
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
        <StatCard
          label="Team members"
          value={String(team.length)}
          icon={Users}
        />
        <StatCard
          label="Funds managed"
          value={fmtUsd(totalManaged)}
          hint={fmtNgn(totalManaged, ngnRate)}
          icon={Wallet}
        />
        <StatCard
          label="Pending requests"
          value={String(pendingRequests.length)}
          icon={ArrowUpRight}
        />
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
      {requests.some((r) => r.status !== "pending") && (
        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <h2 className="text-base font-semibold">Recent decisions</h2>
          <ul className="mt-4 divide-y rounded-xl border">
            {requests
              .filter((r) => r.status !== "pending")
              .slice(0, 8)
              .map((r) => {
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
                      <div className="font-mono">{fmtUsd(m.balance_usd)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtNgn(m.balance_usd, ngnRate)}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap justify-end gap-2">
                        <DepositDialog member={m} leaderId={profile.id} onDone={load} />
                        <UpkeepDialog
                          member={m}
                          leaderId={profile.id}
                          existing={plans.find((p) => p.member_id === m.id) ?? null}
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
                        await supabase
                          .from("upkeep_plans")
                          .update({ active: !p.active })
                          .eq("id", p.id);
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
                        await supabase.from("upkeep_plans").delete().eq("id", p.id);
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
              Each code expires in 20 minutes — share quickly!
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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = depositSchema.safeParse({ amount: Number(amount), note: note || undefined });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      member_id: member.id,
      leader_id: leaderId,
      type: "deposit",
      amount_usd: parsed.data.amount,
      note: parsed.data.note ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Deposit recorded");
    setOpen(false);
    setAmount("");
    setNote("");
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
              <Label htmlFor="dep-amount">Amount (USD)</Label>
              <Input
                id="dep-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
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
  onDone,
}: {
  member: Profile;
  leaderId: string;
  existing: UpkeepPlan | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(existing ? String(existing.amount_usd) : "");
  const [freq, setFreq] = useState<UpkeepFrequency>(existing?.frequency ?? "weekly");
  const [customDays, setCustomDays] = useState(
    existing?.custom_days ? String(existing.custom_days) : "5",
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return toast.error("Enter a valid amount");
    if (freq === "custom_days" && !(Number(customDays) > 0))
      return toast.error("Enter a valid day count");
    setBusy(true);
    const payload = {
      leader_id: leaderId,
      member_id: member.id,
      amount_usd: n,
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
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="up-amount">Amount per cycle (USD)</Label>
              <Input
                id="up-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
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

  const willBecomeDirector = isDirectorOrAbove(newRank);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("promote_member", {
      _member_id: member.id,
      _new_rank: newRank,
      _grant_fund_handler: grant,
      _note: note || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
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
  memberBalance,
  defaultRate,
  onDone,
}: {
  request: WithdrawalRequest;
  memberBalance: number;
  defaultRate: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("NGN");
  const [rate, setRate] = useState(String(defaultRate));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const localAmount = Number(rate) > 0 ? Number(request.amount_usd) * Number(rate) : 0;

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
    setBusy(true);

    const { error: updErr } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "approved",
        leader_note: parsed.data.note ?? undefined,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    if (updErr) {
      setBusy(false);
      return toast.error(updErr.message);
    }

    const { error: txnErr } = await supabase.from("transactions").insert({
      member_id: request.member_id,
      leader_id: request.leader_id,
      type: "withdrawal",
      amount_usd: request.amount_usd,
      currency: parsed.data.currency,
      exchange_rate: parsed.data.exchange_rate,
      local_amount: parsed.data.local_amount ?? null,
      note: parsed.data.note ?? null,
      request_id: request.id,
    });
    setBusy(false);
    if (txnErr) return toast.error(txnErr.message);

    toast.success("Withdrawal approved & recorded");
    setOpen(false);
    onDone();
  };

  const decline = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "declined",
        leader_note: note || null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", request.id);
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
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              Member receives ≈{" "}
              <span className="font-mono font-semibold">
                {localAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
              </span>
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
