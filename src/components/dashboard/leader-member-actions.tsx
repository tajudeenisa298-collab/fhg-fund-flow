import { useState } from "react";
import { toast } from "sonner";
import { Wallet, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import { RANKS } from "@/lib/ranks";
import type { Profile } from "@/lib/auth-context";

export function LeaderMemberActions({
  member,
  onChanged,
}: {
  member: Profile;
  onChanged: () => void;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Leader actions
      </h4>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
          <Wallet className="mr-1.5 size-4" />
          Adjust balance
        </Button>
        <Button variant="outline" size="sm" onClick={() => setRankOpen(true)}>
          <Award className="mr-1.5 size-4" />
          Override rank
        </Button>
      </div>
      <AdjustBalanceDialog
        member={member}
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        onDone={onChanged}
      />
      <OverrideRankDialog
        member={member}
        open={rankOpen}
        onOpenChange={setRankOpen}
        onDone={onChanged}
      />
    </section>
  );
}

function AdjustBalanceDialog({
  member,
  open,
  onOpenChange,
  onDone,
}: {
  member: Profile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amountUsd, setAmountUsd] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setDirection("credit");
    setAmountUsd(0);
    setReason("");
  };

  const submit = async () => {
    if (amountUsd <= 0) return toast.error("Enter an amount greater than 0");
    if (reason.trim().length < 10)
      return toast.error("Please write a reason (at least 10 characters)");
    setBusy(true);
    const { error } = await supabase.rpc("leader_adjust_balance", {
      _member_id: member.id,
      _amount_usd: amountUsd,
      _direction: direction,
      _reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(
      `${direction === "credit" ? "Credited" : "Debited"} $${amountUsd} on ${member.full_name}`
    );
    reset();
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>
            Credit or debit {member.full_name}'s balance. Logged in the audit
            trail and the member is notified. Capped at $500/member/day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "credit" | "debit")}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Credit (add to balance)</SelectItem>
                <SelectItem value="debit">Debit (remove from balance)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Amount</Label>
            <div className="mt-1.5">
              <CurrencyAmountInput valueUsd={amountUsd} onUsdChange={setAmountUsd} />
            </div>
          </div>

          <div>
            <Label htmlFor="reason">Reason (required)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you are making this adjustment"
              className="mt-1.5"
              rows={3}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {reason.trim().length}/10 characters minimum
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : direction === "credit" ? "Credit balance" : "Debit balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverrideRankDialog({
  member,
  open,
  onOpenChange,
  onDone,
}: {
  member: Profile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [newRank, setNewRank] = useState<string>(member.rank);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!newRank) return toast.error("Pick a rank");
    if (newRank === member.rank) return toast.error("Pick a different rank");
    if (reason.trim().length < 10)
      return toast.error("Please write a reason (at least 10 characters)");
    setBusy(true);
    const { error } = await supabase.rpc("leader_override_rank", {
      _member_id: member.id,
      _new_rank: newRank,
      _reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Rank updated to ${newRank}`);
    setReason("");
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Override rank</DialogTitle>
          <DialogDescription>
            Force-set {member.full_name}'s rank. The change is logged and the
            member is notified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label>Current rank</Label>
            <p className="mt-1.5 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {member.rank}
            </p>
          </div>

          <div>
            <Label>New rank</Label>
            <Select value={newRank} onValueChange={setNewRank}>
              <SelectTrigger className="mt-1.5">
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

          <div>
            <Label htmlFor="rank-reason">Reason (required)</Label>
            <Textarea
              id="rank-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this rank change being made?"
              className="mt-1.5"
              rows={3}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {reason.trim().length}/10 characters minimum
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Update rank"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
