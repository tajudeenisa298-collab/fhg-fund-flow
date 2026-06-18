import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Wallet } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import { fmtUsd } from "@/lib/format";
import type { Profile } from "@/lib/auth-context";

export function DispenseUpkeepDialog({
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
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [purseBalance, setPurseBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPurseBalance(null);
    supabase
      .from("leader_purse_ledger")
      .select("amount_usd.sum()")
      .eq("leader_id", leaderId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const sum = Number((data as { sum: number | null } | null)?.sum ?? 0);
        setPurseBalance(sum);
      });
    return () => {
      cancelled = true;
    };
  }, [open, leaderId]);

  const reset = () => {
    setAmountUsd(0);
    setNote("");
    setFile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(amountUsd > 0)) return toast.error("Enter a valid amount");
    setBusy(true);

    let screenshotPath: string | null = null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setBusy(false);
        return toast.error("Screenshot must be under 5 MB");
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${leaderId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("upkeep-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setBusy(false);
        return toast.error(`Upload failed: ${upErr.message}`);
      }
      screenshotPath = path;
    }

    const { error } = await supabase.rpc("dispense_upkeep", {
      _member_id: member.id,
      _amount_usd: Number(amountUsd.toFixed(2)),
      _screenshot_path: screenshotPath ?? undefined,
      _note: note.trim() || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Upkeep sent — awaiting member approval");
    setOpen(false);
    reset();
    onDone();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="mr-1 size-3.5" /> Dispense
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispense upkeep to {member.full_name}</DialogTitle>
            <DialogDescription>
              Record an upkeep payment with proof. The member confirms receipt before the deposit
              hits their balance.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="up-amt">Amount</Label>
              <CurrencyAmountInput
                id="up-amt"
                valueUsd={amountUsd}
                onUsdChange={setAmountUsd}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="up-proof">Payment screenshot (optional, max 5 MB)</Label>
              <Input
                id="up-proof"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="up-note">Note (optional)</Label>
              <Textarea
                id="up-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="e.g. Weekly upkeep for May 12"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send upkeep"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
