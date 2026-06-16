import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Send, Minus, X } from "lucide-react";
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

type Mode = "upkeep" | "message" | "deduction";

export function BulkActionsBar({
  selected,
  onClear,
  onDone,
}: {
  selected: Profile[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (selected.length === 0) return null;

  const close = () => {
    setMode(null);
    setAmount(0);
    setTitle("");
    setBody("");
    setNote("");
  };

  const runUpkeep = async () => {
    if (!(amount > 0)) return toast.error("Enter a valid amount");
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const m of selected) {
      const { error } = await supabase.rpc("dispense_upkeep", {
        _member_id: m.id,
        _amount_usd: Number(amount.toFixed(2)),
        _note: note.trim() || undefined,
      });
      if (error) fail++;
      else ok++;
    }
    setBusy(false);
    if (ok) toast.success(`Sent upkeep to ${ok} member${ok > 1 ? "s" : ""}`);
    if (fail) toast.error(`${fail} failed`);
    close();
    onClear();
    onDone();
  };

  const runMessage = async () => {
    if (title.trim().length < 2) return toast.error("Add a title");
    if (body.trim().length < 2) return toast.error("Add a message");
    setBusy(true);
    const rows = selected.map((m) => ({
      user_id: m.id,
      title: title.trim(),
      body: body.trim(),
      kind: "generic" as const,
      link: "/dashboard",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Message sent to ${selected.length} member${selected.length > 1 ? "s" : ""}`);
    close();
    onClear();
    onDone();
  };

  const runDeduction = async () => {
    if (!(amount > 0)) return toast.error("Enter a valid amount");
    if (note.trim().length < 3) return toast.error("Add a reason");
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const m of selected) {
      const { error } = await supabase.rpc("create_managed_transaction", {
        _member_id: m.id,
        _type: "fund_deduction",
        _amount_usd: Number(amount.toFixed(2)),
        _currency: "USD",
        _note: note.trim(),
      });
      if (error) fail++;
      else ok++;
    }
    setBusy(false);
    if (ok) toast.success(`Deducted from ${ok} member${ok > 1 ? "s" : ""}`);
    if (fail) toast.error(`${fail} failed`);
    close();
    onClear();
    onDone();
  };

  return (
    <>
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 p-3 shadow-elegant backdrop-blur">
        <span className="text-sm font-semibold">
          {selected.length} selected
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {selected.slice(0, 3).map((m) => m.full_name.split(" ")[0]).join(", ")}
          {selected.length > 3 ? ` +${selected.length - 3}` : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("upkeep")}>
            <Send className="mr-1 size-3.5" /> Dispense upkeep
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("message")}>
            <MessageSquare className="mr-1 size-3.5" /> Message
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("deduction")}>
            <Minus className="mr-1 size-3.5" /> Fund deduction
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <Dialog open={mode === "upkeep"} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk dispense upkeep</DialogTitle>
            <DialogDescription>
              Send the same upkeep amount to {selected.length} member
              {selected.length > 1 ? "s" : ""}. Each will need to confirm receipt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount per member</Label>
              <CurrencyAmountInput valueUsd={amount} onUsdChange={setAmount} />
              {amount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total: <span className="font-mono">{fmtUsd(amount * selected.length)}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bup-note">Note (optional)</Label>
              <Input
                id="bup-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={runUpkeep} disabled={busy}>
              {busy ? "Sending…" : `Send to ${selected.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "message"} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk message</DialogTitle>
            <DialogDescription>
              Sends an in-app notification to {selected.length} member
              {selected.length > 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bm-title">Title</Label>
              <Input
                id="bm-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bm-body">Message</Label>
              <Textarea
                id="bm-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={runMessage} disabled={busy}>
              {busy ? "Sending…" : `Send to ${selected.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "deduction"} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk fund deduction</DialogTitle>
            <DialogDescription>
              Deducts the same amount from {selected.length} member
              {selected.length > 1 ? "s" : ""}' balances. This cannot be undone in bulk.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount per member</Label>
              <CurrencyAmountInput valueUsd={amount} onUsdChange={setAmount} />
              {amount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total: <span className="font-mono">{fmtUsd(amount * selected.length)}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bd-note">Reason (required)</Label>
              <Input
                id="bd-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="e.g. Monthly office fund"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={runDeduction} disabled={busy} variant="destructive">
              {busy ? "Deducting…" : `Deduct from ${selected.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
