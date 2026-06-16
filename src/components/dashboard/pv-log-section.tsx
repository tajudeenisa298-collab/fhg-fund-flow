import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, TrendingUp, Pencil, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface PvRow {
  id: string;
  member_id: string;
  period_month: string; // ISO date
  pv: number;
  note: string | null;
  created_at: string;
  member_name?: string;
}

interface TeamMember {
  id: string;
  full_name: string;
}

function monthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function thisMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthInputToDate(v: string) {
  return `${v}-01`;
}

export function PvLogSection({
  ownerId,
  scope,
}: {
  ownerId: string;
  /** "self" = current member's own log; "team" = leader-side, can edit members' entries */
  scope: "self" | "team";
}) {
  const [rows, setRows] = useState<PvRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PvRow | null>(null);
  const [targetMemberId, setTargetMemberId] = useState<string>("");
  const [month, setMonth] = useState(thisMonthValue());
  const [pv, setPv] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (scope === "self") {
      const { data } = await supabase
        .from("pv_logs")
        .select("*")
        .eq("member_id", ownerId)
        .order("period_month", { ascending: false });
      setRows((data as PvRow[]) ?? []);
      return;
    }
    const { data: teamRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("leader_id", ownerId)
      .order("full_name");
    const list = (teamRows ?? []) as TeamMember[];
    setTeam(list);
    const ids = list.map((m) => m.id);
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    const { data } = await supabase
      .from("pv_logs")
      .select("*")
      .in("member_id", ids)
      .order("period_month", { ascending: false });
    const nameMap = new Map(list.map((m) => [m.id, m.full_name]));
    const enriched = ((data as PvRow[]) ?? []).map((r) => ({
      ...r,
      member_name: nameMap.get(r.member_id),
    }));
    setRows(enriched);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, scope]);

  const totals = useMemo(() => {
    const ytd = rows
      .filter((r) => new Date(r.period_month).getFullYear() === new Date().getFullYear())
      .reduce((s, r) => s + Number(r.pv), 0);
    const last = rows[0]?.pv ?? 0;
    return { ytd, last };
  }, [rows]);

  const reset = () => {
    setMonth(thisMonthValue());
    setPv("");
    setNote("");
    setEditing(null);
    setTargetMemberId(scope === "self" ? ownerId : "");
  };

  const startAdd = () => {
    reset();
    setOpen(true);
  };

  const startEdit = (r: PvRow) => {
    setEditing(r);
    setTargetMemberId(r.member_id);
    const d = new Date(r.period_month);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setPv(String(r.pv));
    setNote(r.note ?? "");
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const memberId = scope === "self" ? ownerId : targetMemberId;
    if (!memberId) return toast.error("Pick a member");
    const pvNum = Number(pv);
    if (!Number.isFinite(pvNum) || pvNum < 0) return toast.error("PV must be 0 or more");
    if (!/^\d{4}-\d{2}$/.test(month)) return toast.error("Pick a month");
    setBusy(true);
    const payload = {
      member_id: memberId,
      period_month: monthInputToDate(month),
      pv: pvNum,
      note: note.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("pv_logs").update(payload).eq("id", editing.id)
      : await supabase.from("pv_logs").upsert(payload, { onConflict: "member_id,period_month" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "PV updated" : "PV recorded");
    setOpen(false);
    reset();
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this PV entry?")) return;
    const { error } = await supabase.from("pv_logs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const canManage = scope === "self" || team.length > 0;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">
              NeoLife PV log {scope === "team" && "· team"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {scope === "self"
                ? "Log your monthly Point Value to track sales activity."
                : "Monthly PV for members you manage. You can add or correct entries on their behalf."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest</p>
            <p className="text-lg font-semibold">{totals.last.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">YTD</p>
            <p className="text-lg font-semibold">{totals.ytd.toLocaleString()}</p>
          </div>
          {canManage && (
            <Button onClick={startAdd}>
              <Plus className="mr-1 size-4" /> {scope === "self" ? "Log PV" : "Add for member"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 divide-y rounded-xl border">
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {scope === "self" ? "No PV recorded yet." : "No team PV recorded yet."}
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">{monthLabel(r.period_month)}</p>
              {scope === "team" && r.member_name && (
                <p className="text-xs text-muted-foreground">{r.member_name}</p>
              )}
              {r.note && <p className="mt-0.5 text-xs text-muted-foreground">{r.note}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold tabular-nums">
                {Number(r.pv).toLocaleString()} PV
              </span>
              <Button variant="ghost" size="icon" onClick={() => startEdit(r)}>
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit PV entry" : "Log monthly PV"}</DialogTitle>
            <DialogDescription>One entry per member per month. New entries overwrite the existing one.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {scope === "team" && (
              <div className="space-y-2">
                <Label htmlFor="pv-member">Member</Label>
                <Select
                  value={targetMemberId}
                  onValueChange={setTargetMemberId}
                  disabled={!!editing}
                >
                  <SelectTrigger id="pv-member">
                    <SelectValue placeholder="Choose a member" />
                  </SelectTrigger>
                  <SelectContent>
                    {team.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pv-month">Month</Label>
              <Input
                id="pv-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                max={thisMonthValue()}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pv-amt">Point Value (PV)</Label>
              <Input
                id="pv-amt"
                type="number"
                min="0"
                step="0.01"
                value={pv}
                onChange={(e) => setPv(e.target.value)}
                placeholder="e.g. 150"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pv-note">Note (optional)</Label>
              <Textarea
                id="pv-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : editing ? "Update entry" : "Save entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
