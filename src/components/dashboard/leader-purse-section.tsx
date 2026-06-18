import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { LeaderPurseEntry } from "@/lib/types";
import { fmtUsd, fmtDate } from "@/lib/format";
import { Money } from "@/components/money";
import { CurrencyAmountInput } from "@/components/currency-amount-input";
import { ExportCsvButton } from "@/components/export-csv-button";


export function LeaderPurseSection({ leaderId }: { leaderId: string }) {
  const [rows, setRows] = useState<LeaderPurseEntry[]>([]);
  const [credits, setCredits] = useState(0);
  const [debits, setDebits] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [listRes, credRes, debRes] = await Promise.all([
      supabase
        .from("leader_purse_ledger").select("*").eq("leader_id", leaderId)
        .order("created_at", { ascending: false }).limit(50),
      supabase
        .from("leader_purse_ledger").select("amount_usd.sum()")
        .eq("leader_id", leaderId).eq("kind", "credit").single(),
      supabase
        .from("leader_purse_ledger").select("amount_usd.sum()")
        .eq("leader_id", leaderId).eq("kind", "debit").single(),
    ]);
    setRows((listRes.data as LeaderPurseEntry[]) ?? []);
    setCredits(Number((credRes.data as { sum: number | null } | null)?.sum ?? 0));
    setDebits(Number((debRes.data as { sum: number | null } | null)?.sum ?? 0));
  }, [leaderId]);

  useEffect(() => { load(); }, [load]);

  const balance = credits - debits;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="size-4 text-primary" /> Team leader balance
          </h2>
          <p className="text-sm text-muted-foreground">
            Your personal purse — credits come from fund rules, withdrawals are recorded here.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportCsvButton
            filename="leader_purse"
            rows={rows}
            getRow={(r) => ({
              date: fmtDate(r.created_at),
              kind: r.kind,
              amount_usd: r.amount_usd,
              note: r.note ?? "",
            })}
          />
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Withdraw
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">Available</p>
        <Money usd={balance} size="lg" />
        <p className="mt-1 text-xs text-muted-foreground">
          {fmtUsd(credits)} credited · {fmtUsd(debits)} withdrawn
        </p>
      </div>

      <ul className="mt-4 max-h-64 divide-y overflow-y-auto rounded-xl border">
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">No entries yet.</li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium capitalize">{r.kind === "credit" ? "Credit" : "Withdrawal"}</p>
              <p className="text-xs text-muted-foreground">{r.note ?? "—"} · {fmtDate(r.created_at)}</p>
            </div>
            <span className={`font-mono ${r.kind === "credit" ? "text-success" : "text-destructive"}`}>
              {r.kind === "credit" ? "+" : "−"}{fmtUsd(Number(r.amount_usd))}
            </span>
          </li>
        ))}
      </ul>

      <PurseDialog open={open} onOpenChange={setOpen} leaderId={leaderId} onDone={load} />
    </section>
  );
}

function PurseDialog({
  open, onOpenChange, leaderId, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; leaderId: string; onDone: () => void }) {
  const [amountUsd, setAmountUsd] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(amountUsd > 0)) return toast.error("Enter a valid amount");
    setBusy(true);
    void leaderId;
    const { error } = await supabase.rpc("leader_purse_withdraw", {
      _amount_usd: Number(amountUsd.toFixed(2)),
      _note: note.trim() || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Withdrawal recorded");
    setAmountUsd(0); setNote(""); onOpenChange(false); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leader purse entry</DialogTitle>
          <DialogDescription>Withdraw from your team leader balance. Credits are added by fund rules.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amt">Amount</Label>
            <CurrencyAmountInput id="amt" valueUsd={amountUsd} onUsdChange={setAmountUsd} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nt">Note (optional)</Label>
            <Textarea id="nt" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Salary, refund, etc." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save entry"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

