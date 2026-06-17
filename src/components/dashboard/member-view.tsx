import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet, TrendingUp, Clock, Plus, Download } from "lucide-react";
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
import { AnnouncementsSection } from "@/components/dashboard/announcements-section";
import { ResourceLibrarySection } from "@/components/dashboard/resource-library-section";
import { MemberStatusSelfSection } from "@/components/dashboard/member-status-self-section";
import { usePagedList, ShowMoreButton } from "@/components/paged-list";
import { toCsv, downloadCsv } from "@/lib/csv";
import { X as XIcon, Printer, FileText } from "lucide-react";
import { DateRangeFilter, EMPTY_RANGE, inRange, type DateRange } from "@/components/date-range-filter";
import { printWithdrawalReceipt } from "@/lib/withdrawal-receipt";
import { printMemberStatement } from "@/lib/statement-pdf";
import { ProfileCompleteness } from "@/components/dashboard/profile-completeness";
import { BalanceProjection } from "@/components/dashboard/balance-projection";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";



const requestSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  description: z.string().trim().min(5).max(500),
});

import type { DashboardSection } from "@/components/dashboard/dashboard-sub-nav";

export function MemberView({ profile, section = "all" }: { profile: Profile; section?: DashboardSection | "all" }) {
  const show = (s: DashboardSection | "office") => section === "all" || section === s;
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
  const [bankVerifiedAt, setBankVerifiedAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    supabase
      .from("bank_accounts")
      .select("verified_at")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setBankVerifiedAt((data?.verified_at as string | null) ?? null));
  }, [profile.id]);

  const bankNeedsAttention =
    bankVerifiedAt === null
      ? true
      : typeof bankVerifiedAt === "string"
      ? (Date.now() - new Date(bankVerifiedAt).getTime()) / 86400000 > 180
      : false;

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

  const [txnRange, setTxnRange] = useState<DateRange>(EMPTY_RANGE);
  const filteredTxns = useMemo(() => txns.filter((t) => inRange(t.created_at, txnRange)), [txns, txnRange]);
  const requestsPage = usePagedList(requests);
  const txnsPage = usePagedList(filteredTxns);

  const generateCode = async () => {
    try {
      await createInviteCode();
      toast.success("Invite code created — valid for 24 hours");
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
      {show("overview") && (<>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">Your managed funds and activity.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              printMemberStatement({
                member_name: profile.full_name,
                member_email: profile.email,
                locale: profile.locale,
                balance_usd: profile.balance_usd,
                days: 90,
                transactions: txns,
              })
            }
            disabled={txns.length === 0}
          >
            <FileText className="mr-1 size-4" /> Statement (PDF)
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const txnsCsv = toCsv(
                txns.map((t) => ({
                  date: t.created_at,
                  type: t.type,
                  amount_usd: t.amount_usd,
                  currency: t.currency,
                  local_amount: t.local_amount,
                  exchange_rate: t.exchange_rate,
                  note: t.note,
                })),
              );
              const reqCsv = toCsv(
                requests.map((r) => ({
                  date: r.created_at,
                  amount_usd: r.amount_usd,
                  status: r.status,
                  description: r.description,
                  leader_note: r.leader_note,
                  resolved_at: r.resolved_at,
                })),
              );
              const stamp = new Date().toISOString().slice(0, 10);
              const safeName = profile.full_name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
              downloadCsv(`${safeName}_transactions_${stamp}.csv`, txnsCsv);
              if (reqCsv) downloadCsv(`${safeName}_withdrawals_${stamp}.csv`, reqCsv);
              toast.success("Your data export has started downloading");
            }}
            disabled={txns.length === 0 && requests.length === 0}
          >
            <Download className="mr-1 size-4" /> Export my data
          </Button>
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
      </div>


      {(!profile.leader_id || bankNeedsAttention) && (
        <div className="space-y-2">
          {!profile.leader_id && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
              <strong className="font-semibold">No team leader assigned.</strong> You can't request a
              withdrawal until a leader is attached to your account. Reach out to your sponsor or wait
              for reassignment.
            </div>
          )}
          {bankNeedsAttention && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong className="font-semibold">
                  {bankVerifiedAt === null ? "Bank account not verified." : "Bank details haven't been re-verified in over 6 months."}
                </strong>{" "}
                Verify now to avoid payout delays.
              </span>
              <a href="/settings" className="text-xs font-medium underline underline-offset-2">
                Go to settings →
              </a>
            </div>
          )}
        </div>
      )}

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

      <OnboardingChecklist profile={profile} />

      <BalanceProjection memberId={profile.id} balanceUsd={profile.balance_usd} />

      <ProfileCompleteness profile={profile} />

      <MemberStatusSelfSection memberId={profile.id} />
      </>)}

      {show("money") && (
        <PendingUpkeepSection memberId={profile.id} onChanged={() => { load(); refresh(); }} />
      )}

      {show("admin") && (
        <PvLogSection ownerId={profile.id} scope="self" />
      )}

      {show("team") && (
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
      )}

      {show("money") && (
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold">Withdrawal requests</h2>
        <div className="mt-4 divide-y rounded-xl border">
          {requests.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No requests yet.</p>
          )}
          {requestsPage.slice.map((r) => {
            const cancelled = (r as WithdrawalRequest & { cancelled_by_member?: boolean }).cancelled_by_member;
            return (
            <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {fmtUsd(r.amount_usd)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({r.snapshot_rate && r.snapshot_local_amount
                      ? `${r.snapshot_currency ?? "NGN"} ${r.snapshot_local_amount.toLocaleString()} @ ${r.snapshot_rate}`
                      : fmtNgn(r.amount_usd, ngnRate)})
                  </span>
                </p>
                {r.snapshot_rate && r.status === "pending" && (
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Rate locked when you submitted
                  </p>
                )}
                <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                {r.leader_note && !cancelled && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    Leader: "{r.leader_note}"
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
                {r.status === "pending" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (!confirm("Cancel this withdrawal request?")) return;
                      const { error } = await supabase.rpc("cancel_withdrawal_request", { _id: r.id });
                      if (error) return toast.error(error.message);
                      toast.success("Request cancelled");
                      load();
                    }}
                  >
                    <XIcon className="mr-1 size-3" /> Cancel request
                  </Button>
                )}
                {r.status === "approved" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() =>
                      printWithdrawalReceipt({
                        id: r.id,
                        amount_usd: Number(r.amount_usd),
                        description: r.description,
                        member_name: profile.full_name,
                        resolved_at: r.resolved_at,
                        created_at: r.created_at,
                        snapshot_currency: r.snapshot_currency,
                        snapshot_local_amount: r.snapshot_local_amount,
                        snapshot_rate: r.snapshot_rate,
                        leader_note: r.leader_note,
                      })
                    }
                  >
                    <Printer className="mr-1 size-3" /> Print receipt
                  </Button>
                )}
              </div>
              <StatusPill status={r.status} cancelled={cancelled} />
            </div>
          );
          })}
          <ShowMoreButton
            hasMore={requestsPage.hasMore}
            onClick={requestsPage.showMore}
            remaining={requestsPage.total - requestsPage.visible}
          />
        </div>
      </section>
      )}

      {show("admin") && profile.leader_id && (
        <AnnouncementsSection leaderId={profile.leader_id} canManage={false} />
      )}

      {show("admin") && profile.leader_id && (
        <ResourceLibrarySection leaderId={profile.leader_id} canManage={false} />
      )}

      {show("money") && (
        <TeamFundRulesReadonly leaderId={profile.leader_id} />
      )}

      {show("team") && (
        <DownlineSection rootId={profile.id} />
      )}

      {show("money") && (
      <section className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Transaction history</h2>
          {txns.length > 0 && <DateRangeFilter value={txnRange} onChange={setTxnRange} />}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          {txns.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : filteredTxns.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions in this date range.</p>
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
      )}

    </div>
  );
}

function StatusPill({ status, cancelled }: { status: WithdrawalRequest["status"]; cancelled?: boolean }) {
  const label = cancelled ? "cancelled" : status;
  const styles =
    status === "pending"
      ? "bg-warning/15 text-warning"
      : status === "approved"
        ? "bg-success/15 text-success"
        : cancelled
          ? "bg-muted text-muted-foreground"
          : "bg-destructive/15 text-destructive";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles}`}>
      {label}
    </span>
  );
}
