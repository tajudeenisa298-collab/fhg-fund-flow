import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pause, Play, Trash2, Pencil } from "lucide-react";
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
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/auth-context";
import {
  type FundFrequency,
  type FundDestination,
  type FundKind,
  type FundRule,
  FUND_FREQ_LABEL,
} from "@/lib/types";

const ngn = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);

const FUND_DEST_LABEL: Record<FundDestination, string> = {
  office_support: "Office support",
  team_leader: "Team leader",
  custom: "Custom fund",
  member_upkeep: "Member upkeep",
};

export function FundRulesSection({ leaderId }: { leaderId: string }) {
  const [rules, setRules] = useState<FundRule[]>([]);
  const [team, setTeam] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<FundRule | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase
        .from("fund_rules")
        .select("*")
        .eq("leader_id", leaderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, email, rank, balance_usd, can_handle_funds, leader_id, sponsor_id, gender, avatar_url, whatsapp_number, payout_method, created_at, updated_at")
        .eq("leader_id", leaderId)
        .order("full_name"),
    ]);
    setRules((r as FundRule[]) ?? []);
    setTeam((t as Profile[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId]);
  const memberName = (id: string | null) =>
    id ? team.find((m) => m.id === id)?.full_name ?? "Unknown member" : null;

  const toggle = async (r: FundRule) => {
    await supabase.from("fund_rules").update({ active: !r.active }).eq("id", r.id);
    load();
  };
  const remove = async (r: FundRule) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    await supabase.from("fund_rules").delete().eq("id", r.id);
    load();
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Team fund rules</h2>
          <p className="text-sm text-muted-foreground">
            Office support, TV fund, etc. — choose per-USD or fixed deductions.
            Override any rule for a specific member to handle different branch costs.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" /> Add rule
        </Button>
      </div>

      <ul className="mt-4 divide-y rounded-xl border">
        {rules.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            No fund rules yet. Add one to start auto-deducting from member deposits.
          </li>
        )}
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {r.name}{" "}
                {r.member_id && (
                  <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                    override · {memberName(r.member_id)}
                  </span>
                )}
                {!r.active && (
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    paused
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {FUND_DEST_LABEL[r.destination]} · {r.kind === "per_usd"
                  ? `${ngn(Number(r.amount_ngn))} per $1 deposit`
                  : `${ngn(Number(r.amount_ngn))} ${r.frequency ? FUND_FREQ_LABEL[r.frequency].toLowerCase() : ""}`}
                {r.frequency === "custom_days" && r.custom_days
                  ? ` (every ${r.custom_days} days)`
                  : ""}
              </p>
              {r.description && (
                <p className="mt-0.5 text-xs italic text-muted-foreground">{r.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => toggle(r)} title={r.active ? "Pause" : "Resume"}>
                {r.active ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setEditing(r)} title="Edit">
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(r)} title="Delete">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <RuleDialog
        open={creating || editing !== null}
        onOpenChange={(v) => {
          if (!v) {
            setCreating(false);
            setEditing(null);
          }
        }}
        leaderId={leaderId}
        team={team}
        existing={editing}
        onDone={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />
    </section>
  );
}

function RuleDialog({
  open,
  onOpenChange,
  leaderId,
  team,
  existing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaderId: string;
  team: Profile[];
  existing: FundRule | null;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FundKind>("per_usd");
  const [destination, setDestination] = useState<FundDestination>("office_support");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<FundFrequency>("monthly");
  const [customDays, setCustomDays] = useState("7");
  const [desc, setDesc] = useState("");
  const [memberId, setMemberId] = useState<string>("__all__");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setKind(existing.kind);
      setDestination(existing.destination);
      setAmount(String(existing.amount_ngn));
      setFreq(existing.frequency ?? "monthly");
      setCustomDays(existing.custom_days ? String(existing.custom_days) : "7");
      setDesc(existing.description ?? "");
      setMemberId(existing.member_id ?? "__all__");
    } else {
      setName("");
      setKind("per_usd");
      setDestination("office_support");
      setAmount("");
      setFreq("monthly");
      setCustomDays("7");
      setDesc("");
      setMemberId("__all__");
    }
  }, [existing, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!name.trim()) return toast.error("Give the rule a name");
    if (!(n > 0)) return toast.error("Enter a valid amount");
    setBusy(true);
    const payload = {
      leader_id: leaderId,
      member_id: memberId === "__all__" ? null : memberId,
      name: name.trim(),
      kind,
      destination,
      amount_ngn: n,
      frequency: kind === "fixed" ? freq : null,
      custom_days: kind === "fixed" && freq === "custom_days" ? Number(customDays) : null,
      description: desc.trim() || null,
      next_run_at: kind === "fixed" ? new Date().toISOString() : null,
    };
    const { error } = existing
      ? await supabase.from("fund_rules").update(payload).eq("id", existing.id)
      : await supabase.from("fund_rules").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Rule updated" : "Rule created");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit rule" : "New fund rule"}</DialogTitle>
          <DialogDescription>
            Per-USD rules apply automatically when you record a deposit. Fixed rules charge every
            member on a schedule.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="r-name">Name</Label>
            <Input
              id="r-name"
              placeholder="e.g. Office Support, TV Fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Deduction type</Label>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as FundKind)} className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
                <RadioGroupItem value="per_usd" className="mt-0.5" />
                <span>
                  <span className="block font-medium">Per USD</span>
                  <span className="text-xs text-muted-foreground">
                    e.g. ₦200 per $1 deposit
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
                <RadioGroupItem value="fixed" className="mt-0.5" />
                <span>
                  <span className="block font-medium">Fixed amount</span>
                  <span className="text-xs text-muted-foreground">e.g. ₦5,000 weekly</span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="r-amt">Amount (NGN)</Label>
            <Input
              id="r-amt"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Destination</Label>
            <Select value={destination} onValueChange={(v) => setDestination(v as FundDestination)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FUND_DEST_LABEL) as FundDestination[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {FUND_DEST_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind === "fixed" && (
            <>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={freq} onValueChange={(v) => setFreq(v as FundFrequency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FUND_FREQ_LABEL) as FundFrequency[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {FUND_FREQ_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {freq === "custom_days" && (
                <div className="space-y-2">
                  <Label htmlFor="r-days">Every N days</Label>
                  <Input
                    id="r-days"
                    type="number"
                    min="1"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="r-desc">Description (optional)</Label>
            <Textarea
              id="r-desc"
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : existing ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
