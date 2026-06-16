import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Money } from "@/components/money";
import { UserAvatar } from "@/components/user-avatar";
import { fmtDate } from "@/lib/format";
import type { Profile } from "@/lib/auth-context";
import type { Transaction, WithdrawalRequest, BankAccount } from "@/lib/types";
import { MemberStatusBadge } from "@/components/dashboard/member-status-menu";

const REVERSIBLE_TYPES = new Set(["deposit", "fund_deduction", "bank_fee"]);

export function MemberDetailDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Profile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [reqs, setReqs] = useState<WithdrawalRequest[]>([]);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Transaction | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reversedIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of txns) {
      if (t.parent_txn_id && t.note?.startsWith("Reversal of")) set.add(t.parent_txn_id);
    }
    return set;
  }, [txns]);

  useEffect(() => {
    if (!member || !open) return;
    Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false }),
      supabase.from("bank_accounts").select("*").eq("user_id", member.id).maybeSingle(),
    ]).then(([t, r, b]) => {
      setTxns((t.data as Transaction[]) ?? []);
      setReqs((r.data as WithdrawalRequest[]) ?? []);
      setBank((b.data as BankAccount) ?? null);
    });
  }, [member, open, reloadKey]);

  const doReverse = async () => {
    if (!reverseTarget) return;
    setReversing(true);
    const { error } = await supabase.rpc("reverse_transaction", {
      _txn_id: reverseTarget.id,
      _reason: reverseReason || undefined,
    });
    setReversing(false);
    if (error) return toast.error(error.message);
    toast.success("Transaction reversed");
    setReverseTarget(null);
    setReverseReason("");
    setReloadKey((k) => k + 1);
  };

  if (!member) return null;

  const sum = (filter: (t: Transaction) => boolean) =>
    txns.filter(filter).reduce((s, t) => s + Number(t.amount_usd), 0);

  const totalDeposits = sum((t) => t.type === "deposit");
  const totalWithdrawn = sum((t) => t.type === "withdrawal");
  const totalReleased = sum((t) => t.type === "release");
  const totalDeducted = sum((t) => t.type === "fund_deduction");
  const pendingAmt = reqs.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.amount_usd), 0);
  const approvedAmt = reqs.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.amount_usd), 0);
  const declinedAmt = reqs.filter((r) => r.status === "declined").reduce((s, r) => s + Number(r.amount_usd), 0);

  // Fund-rule breakdown by name (deductions)
  const byRule = new Map<string, number>();
  txns
    .filter((t) => t.type === "fund_deduction")
    .forEach((t) => {
      const k = t.note ?? "Other";
      byRule.set(k, (byRule.get(k) ?? 0) + Number(t.amount_usd));
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <UserAvatar name={member.full_name} avatarPath={member.avatar_url} className="size-12" />
            <div className="min-w-0">
              <DialogTitle className="flex flex-wrap items-center gap-1">
                <span>{member.full_name}</span>
                <MemberStatusBadge member={member} />
              </DialogTitle>
              <DialogDescription>
                {member.rank} · {member.email}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-5">
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Balances
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Current balance" usd={member.balance_usd} />
                <Stat label="Total deposits" usd={totalDeposits} />
                <Stat label="Total withdrawn" usd={totalWithdrawn} />
                <Stat label="Released on promo" usd={totalReleased} />
                <Stat label="Pending requests" usd={pendingAmt} />
                <Stat label="Approved requests" usd={approvedAmt} />
                <Stat label="Declined requests" usd={declinedAmt} />
                <Stat label="Total deducted (funds)" usd={totalDeducted} />
              </div>
            </section>

            {byRule.size > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Deductions breakdown
                </h4>
                <ul className="divide-y rounded-xl border">
                  {[...byRule.entries()].map(([name, amt]) => (
                    <li key={name} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{name}</span>
                      <Money usd={amt} size="sm" inline />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contact & payout preference
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">WhatsApp</p>
                  {member.whatsapp_number ? (
                    <a
                      href={`https://wa.me/${member.whatsapp_number.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {member.whatsapp_number}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">Not provided</p>
                  )}
                </div>
                <div className="rounded-xl border p-3 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payout method</p>
                  <p className="font-medium">
                    {member.payout_method === "neolife_pv" ? "NeoLife PV credit" : "Bank transfer (NGN)"}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Bank
              </h4>
              {bank ? (
                <div className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">{bank.account_owner_name}</p>
                  <p className="text-muted-foreground">
                    {bank.bank_name} · <span className="font-mono">{bank.account_number}</span>
                  </p>
                  {bank.verified_at && (
                    <p className="mt-1 text-xs text-success">✓ Verified via Paystack</p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                  No bank details on file.
                </p>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Transaction history ({txns.length})
              </h4>
              <div className="overflow-x-auto rounded-xl border">
                {txns.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No transactions yet.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">When</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Note</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                        <th className="px-3 py-2 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {txns.map((t) => {
                        const isReversed = reversedIds.has(t.id);
                        const isReversal = !!t.note?.startsWith("Reversal of");
                        const canReverse =
                          REVERSIBLE_TYPES.has(t.type) && !isReversed && !isReversal;
                        return (
                          <tr key={t.id} className={isReversed ? "opacity-60" : ""}>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                              {fmtDate(t.created_at)}
                            </td>
                            <td className="px-3 py-2 capitalize">
                              {t.type.replace("_", " ")}
                              {isReversed && (
                                <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                                  · reversed
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{t.note ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <Money usd={t.amount_usd} rate={t.exchange_rate ?? undefined} size="sm" inline />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {canReverse && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => setReverseTarget(t)}
                                  title="Reverse this transaction"
                                >
                                  <Undo2 className="size-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Requests ({reqs.length})
              </h4>
              <ul className="divide-y rounded-xl border">
                {reqs.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No requests.
                  </li>
                )}
                {reqs.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Money usd={r.amount_usd} size="sm" inline />
                      <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                      {r.leader_note && (
                        <p className="text-xs italic text-muted-foreground">"{r.leader_note}"</p>
                      )}
                      <p className="text-[10px] uppercase text-muted-foreground">
                        {fmtDate(r.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                        r.status === "pending"
                          ? "bg-warning/15 text-warning"
                          : r.status === "approved"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>

      <AlertDialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {reverseTarget && (
                <>
                  This will create a paired correcting entry that undoes the{" "}
                  <span className="font-medium capitalize">
                    {reverseTarget.type.replace("_", " ")}
                  </span>{" "}
                  of <span className="font-mono">${Number(reverseTarget.amount_usd).toFixed(2)}</span>
                  . The original record stays in the history for audit.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reverse-reason">Reason (optional)</Label>
            <Textarea
              id="reverse-reason"
              rows={3}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Why is this being reversed?"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doReverse} disabled={reversing}>
              {reversing ? "Reversing…" : "Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function Stat({ label, usd }: { label: string; usd: number | string }) {
  return (
    <div className="rounded-xl border bg-card/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <Money usd={usd} size="sm" />
    </div>
  );
}
