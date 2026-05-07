import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Users, Wallet, Plus, Copy, ArrowUpRight, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth-context";
import { fmtUsd, fmtDate } from "@/lib/format";
import type { WithdrawalRequest } from "@/lib/types";
import { StatCard } from "@/components/dashboard/stat-card";

interface InviteCode {
  id: string;
  code: string;
  created_at: string;
  used_by: string | null;
  revoked: boolean;
}

export function LeaderView({ profile }: { profile: Profile }) {
  const { refresh } = useAuth();
  const [team, setTeam] = useState<Profile[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);

  const load = async () => {
    const [{ data: t }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("invite_codes").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("withdrawal_requests").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
    ]);
    setTeam((t as Profile[]) ?? []);
    setCodes((c as InviteCode[]) ?? []);
    setRequests((r as WithdrawalRequest[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [profile.id]);

  const totalManaged = team.reduce((s, m) => s + Number(m.balance_usd), 0);
  const activeCodes = codes.filter((c) => !c.used_by && !c.revoked).length;
  const pendingRequests = requests.filter((r) => r.status === "pending");

  const generateCode = async () => {
    const code = `FHG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await supabase.from("invite_codes").insert({ code, leader_id: profile.id });
    if (error) return toast.error(error.message);
    toast.success("Invite code created");
    load();
  };

  const memberById = (id: string) => team.find((m) => m.id === id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, Director {profile.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">Manage your team's funds and requests.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Team members" value={String(team.length)} icon={Users} />
        <StatCard label="Funds managed" value={fmtUsd(totalManaged)} icon={Wallet} />
        <StatCard label="Pending requests" value={String(pendingRequests.length)} icon={ArrowUpRight} />
        <StatCard label="Active codes" value={String(activeCodes)} icon={Plus} />
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
                    {m?.full_name ?? "Member"} · {fmtUsd(r.amount_usd)}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
                </div>
                <ApproveDialog
                  request={r}
                  memberBalance={Number(m?.balance_usd ?? 0)}
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
                        {m?.full_name ?? "Member"} · {fmtUsd(r.amount_usd)}
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
            <p className="text-sm text-muted-foreground">Add deposits or promote when ready.</p>
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
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">{m.rank}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtUsd(m.balance_usd)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <DepositDialog member={m} leaderId={profile.id} onDone={load} />
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

      {/* Invite codes */}
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Invite codes</h2>
            <p className="text-sm text-muted-foreground">Share with new recruits.</p>
          </div>
          <Button onClick={generateCode}>
            <Plus className="mr-1 size-4" /> Generate code
          </Button>
        </div>
        <div className="mt-4 divide-y rounded-xl border">
          {codes.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No codes yet.</p>
          )}
          {codes.map((c) => {
            const status = c.revoked ? "Revoked" : c.used_by ? "Used" : "Active";
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
                  onClick={() => {
                    navigator.clipboard.writeText(c.code);
                    toast.success(`Copied ${c.code}`);
                  }}
                  disabled={status !== "Active"}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Deposit
      </Button>
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
  );
}

/* ─── Promote dialog ─── */

function PromoteDialog({ member, onDone }: { member: Profile; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const promote = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("promote_member_to_leader", {
      _member_id: member.id,
      _note: "Promoted to Team Leader",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${member.full_name} is now a Team Leader`);
    onDone();
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <BadgeCheck className="mr-1 size-3.5" /> Promote
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Promote {member.full_name} to Team Leader?</AlertDialogTitle>
          <AlertDialogDescription>
            Their managed balance ({fmtUsd(member.balance_usd)}) will be released and they'll be
            able to manage their own team. They keep the same login.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={promote} disabled={busy}>
            {busy ? "Promoting…" : "Promote"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  onDone,
}: {
  request: WithdrawalRequest;
  memberBalance: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("NGN");
  const [rate, setRate] = useState("1300");
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

    // 1. Update request
    const { error: updErr } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "approved",
        leader_note: parsed.data.note ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    if (updErr) {
      setBusy(false);
      return toast.error(updErr.message);
    }

    // 2. Insert transaction (trigger updates balance)
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
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        Review
      </Button>
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
                placeholder="NGN"
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
  );
}
