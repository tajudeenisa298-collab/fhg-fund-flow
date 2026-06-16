import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet, TrendingUp, Clock, Plus } from "lucide-react";
import { z } from "zod";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth-context";
import { fmtUsd, fmtNgn, fmtDate, fmtMoney } from "@/lib/format";
import { Money } from "@/components/money";
import type { Transaction, WithdrawalRequest } from "@/lib/types";
import { StatCard } from "@/components/dashboard/stat-card";
import { DownlineSection } from "@/components/dashboard/downline-section";
import { TeamFundRulesReadonly } from "@/components/dashboard/team-fund-rules-readonly";
import { InviteCodeRow, type InviteCodeRowData } from "@/components/dashboard/invite-code-row";
import { generateInviteCode } from "@/lib/team.functions";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import { PendingUpkeepSection } from "@/components/dashboard/pending-upkeep-section";
import { PvLogSection } from "@/components/dashboard/pv-log-section";
import { usePagedList, ShowMoreButton } from "@/components/paged-list";



const requestSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  description: z.string().trim().min(5).max(500),
});

export function MemberView({ profile }: { profile: Profile }) {
  const { refresh, ngnRate } = useAuth();
  const createInviteCode = useServerFn(generateInviteCode);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [codes, setCodes] = useState<InviteCodeRowData[]>([]);
  const [tick, setTick] = useState(0);

  const load = async () => {
    const [{ data: t }, { data: r }, { data: c }] = await Promise.all([
      supabase.from("transactions").select("*").eq("member_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("withdrawal_requests").select("*").eq("member_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("invite_codes").select("*").eq("leader_id", profile.id).order("created_at", { ascending: false }),
    ]);
    setTxns((t as Transaction[]) ?? []);
    setRequests((r as WithdrawalRequest[]) ?? []);
    setCodes((c as InviteCodeRowData[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [profile.id]);

  // Live updates so downline, balance and history refresh instantly
  useEffect(() => {
    const ch = supabase
      .channel(`member-dash:${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `member_id=eq.${profile.id}` }, () => { load(); refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `member_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invite_codes", filter: `leader_id=eq.${profile.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const pending = requests.filter((r) => r.status === "pending").length;
  const visibleCodes = useMemo(
    () => codes.filter((c) => !c.used_by && !c.revoked && new Date(c.expires_at).getTime() > Date.now()),
    [codes, tick],
  );

  const requestsPage = usePagedList(requests);
  const txnsPage = usePagedList(txns);

  const generateCode = async () => {
    try {
      await createInviteCode();
      toast.success("Invite code created — valid for 2 minutes");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create invite code");
    }
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = requestSchema.safeParse({ amount, description });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!profile.leader_id) {
      toast.error("You don't have a team leader assigned.");
      return;
    }
    if (parsed.data.amount > Number(profile.balance_usd)) {
      toast.error("Amount exceeds your managed balance.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("withdrawal_requests").insert({
      member_id: profile.id,
      leader_id: profile.leader_id,
      amount_usd: parsed.data.amount,
      description: parsed.data.description,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Withdrawal request submitted");
    setOpen(false);
    setAmount(0);
    setDescription("");
    await load();
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">Your managed funds and activity.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!profile.leader_id || Number(profile.balance_usd) <= 0}>
              <Plus className="mr-1 size-4" /> Request withdrawal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request a withdrawal</DialogTitle>
              <DialogDescription>
                Your team leader will review and respond. Be clear about what the funds are for.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <CurrencyAmountInput
                  id="amount"
                  valueUsd={amount}
                  onUsdChange={setAmount}
                />

                <p className="text-xs text-muted-foreground">
                  Available: {fmtUsd(profile.balance_usd)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Reason</Label>
                <Textarea
                  id="desc"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this withdrawal for?"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit request"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Managed balance"
          valueNode={<Money usd={profile.balance_usd} size="lg" />}
          icon={Wallet}
          hint="Held by your leader"
        />
        <StatCard label="Current rank" value={profile.rank} icon={TrendingUp} hint="Reach Director to unlock" />
        <StatCard label="Pending requests" value={String(pending)} icon={Clock} />
      </div>

      <PendingUpkeepSection memberId={profile.id} onChanged={() => { load(); refresh(); }} />

      <PvLogSection ownerId={profile.id} scope="self" />


      <section className="rounded-2xl border bg-card p-6 shadow-card">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Invite codes</h2>
            <p className="text-sm text-muted-foreground">Generate codes for people you personally sponsor.</p>
          </div>
          <Button onClick={generateCode}>
            <Plus className="mr-1 size-4" /> Generate code
          </Button>
        </div>
        <div className="mt-4 divide-y rounded-xl border">
          {visibleCodes.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No active codes.</p>
          )}
          {visibleCodes.map((c) => (
            <InviteCodeRow key={c.id} code={c} onExpired={() => setTick((t) => t + 1)} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold">Withdrawal requests</h2>
        <div className="mt-4 divide-y rounded-xl border">
          {requests.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No requests yet.</p>
          )}
          {requestsPage.slice.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {fmtUsd(r.amount_usd)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({fmtNgn(r.amount_usd, ngnRate)})
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                {r.leader_note && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    Leader: "{r.leader_note}"
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
              </div>
              <StatusPill status={r.status} />
            </div>
          ))}
          <ShowMoreButton
            hasMore={requestsPage.hasMore}
            onClick={requestsPage.showMore}
            remaining={requestsPage.total - requestsPage.visible}
          />
        </div>
      </section>

      {/* Team fund rules — what your leader auto-deducts */}
      <TeamFundRulesReadonly leaderId={profile.leader_id} />

      {/* Pyramid: people you've sponsored, directly or indirectly */}
      <DownlineSection rootId={profile.id} />

      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold">Transaction history</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          {txns.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 text-right font-medium">USD</th>
                    <th className="px-4 py-3 text-right font-medium">Local</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {txnsPage.slice.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDate(t.created_at)}</td>
                      <td className="px-4 py-3 capitalize">{t.type}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.note ?? "—"}</td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          t.type === "deposit" || t.type === "adjustment" ? "text-success" : "text-foreground"
                        }`}
                      >
                        {t.type === "withdrawal" || t.type === "release" ? "−" : "+"}
                        {fmtUsd(t.amount_usd)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {t.local_amount && t.currency !== "USD"
                          ? `${fmtMoney(t.local_amount, t.currency)} @ ${t.exchange_rate}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ShowMoreButton
                hasMore={txnsPage.hasMore}
                onClick={txnsPage.showMore}
                remaining={txnsPage.total - txnsPage.visible}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: WithdrawalRequest["status"] }) {
  const styles =
    status === "pending"
      ? "bg-warning/15 text-warning"
      : status === "approved"
        ? "bg-success/15 text-success"
        : "bg-destructive/15 text-destructive";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles}`}>
      {status}
    </span>
  );
}
