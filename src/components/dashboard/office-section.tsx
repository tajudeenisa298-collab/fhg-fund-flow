import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { OfficeLedgerEntry } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { ExportCsvButton } from "@/components/export-csv-button";

const fmtNgn = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

export function OfficeSection({ leaderId }: { leaderId: string }) {
  const [rows, setRows] = useState<OfficeLedgerEntry[]>([]);
  const [supportIn, setSupportIn] = useState(0);
  const [expenseOut, setExpenseOut] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [listRes, credRes, debRes] = await Promise.all([
      supabase
        .from("office_ledger").select("*").eq("leader_id", leaderId)
        .order("created_at", { ascending: false }).limit(50),
      supabase
        .from("office_ledger").select("amount_ngn.sum()")
        .eq("leader_id", leaderId).eq("kind", "support_in").single(),
      supabase
        .from("office_ledger").select("amount_ngn.sum()")
        .eq("leader_id", leaderId).eq("kind", "expense_out").single(),
    ]);
    setRows((listRes.data as OfficeLedgerEntry[]) ?? []);
    setSupportIn(Number((credRes.data as { sum: number | null } | null)?.sum ?? 0));
    setExpenseOut(Number((debRes.data as { sum: number | null } | null)?.sum ?? 0));
  }, [leaderId]);

  useEffect(() => { load(); }, [load]);

  const balance = supportIn - expenseOut;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Building2 className="size-4 text-primary" /> Office support
          </h2>
          <p className="text-sm text-muted-foreground">
            Auto-credited from per-deposit rules. Log expenses (electricity, rent…) below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            filename="office_ledger"
            rows={rows}
            getRow={(r) => ({
              date: fmtDate(r.created_at),
              kind: r.kind,
              amount_ngn: r.amount_ngn,
              category: r.category ?? "",
              note: r.note ?? "",
            })}
          />
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-4" /> Log expense
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Balance" value={fmtNgn(balance)} tone={balance >= 0 ? "good" : "bad"} />
        <Stat label="Total support in" value={fmtNgn(supportIn)} />
        <Stat label="Total expenses" value={fmtNgn(expenseOut)} tone="muted" />
      </div>

      <ul className="mt-4 max-h-64 divide-y overflow-y-auto rounded-xl border">
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">No entries yet.</li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.category ?? (r.kind === "support_in" ? "Support" : "Expense")}</p>
              <p className="text-xs text-muted-foreground">
                {r.note ?? "—"} · {fmtDate(r.created_at)}
              </p>
            </div>
            <span className={`font-mono ${r.kind === "support_in" ? "text-success" : "text-destructive"}`}>
              {r.kind === "support_in" ? "+" : "−"}{fmtNgn(Number(r.amount_ngn))}
            </span>
          </li>
        ))}
      </ul>

      <ExpenseDialog open={open} onOpenChange={setOpen} leaderId={leaderId} onDone={load} />
    </section>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "good" | "bad" | "muted" | "default" }) {
  const cls = tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-semibold ${cls}`}>{value}</p>
    </div>
  );
}

function ExpenseDialog({
  open, onOpenChange, leaderId, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; leaderId: string; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return toast.error("Enter a valid amount");
    if (!category.trim()) return toast.error("Category is required");
    setBusy(true);
    void leaderId;
    const { error } = await supabase.rpc("record_office_expense", {
      _amount_ngn: n,
      _category: category.trim(),
      _note: note.trim() || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Expense logged");
    setAmount(""); setCategory(""); setNote("");
    onOpenChange(false); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log office expense</DialogTitle>
          <DialogDescription>Subtracts from your office support balance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat">Category</Label>
            <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Electricity, Rent, Internet…" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amt">Amount (NGN)</Label>
            <Input id="amt" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nt">Note (optional)</Label>
            <Textarea id="nt" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log expense"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
