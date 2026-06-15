import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fmtNgn, fmtUsd } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { FREQ_LABEL, type RankUpkeepDefault, type UpkeepFrequency } from "@/lib/types";
import { RANKS } from "@/lib/ranks";

export function RankUpkeepDefaultsSection({
  leaderId,
  defaults,
  onChanged,
}: {
  leaderId: string;
  defaults: RankUpkeepDefault[];
  onChanged: () => void;
}) {
  const { ngnRate } = useAuth();
  const rate = ngnRate ?? 1600;
  const [rank, setRank] = useState<string>("Member");
  const [amountNgn, setAmountNgn] = useState("");
  const [freq, setFreq] = useState<UpkeepFrequency>("weekly");
  const [customDays, setCustomDays] = useState("5");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ngn = Number(amountNgn);
    if (!(ngn > 0)) return toast.error("Enter a valid Naira amount");
    if (freq === "custom_days" && !(Number(customDays) > 0))
      return toast.error("Enter a valid day count");
    const usd = Number((ngn / rate).toFixed(4));
    setBusy(true);
    const { error } = await supabase
      .from("rank_upkeep_defaults")
      .upsert(
        {
          leader_id: leaderId,
          rank,
          amount_usd: usd,
          frequency: freq,
          custom_days: freq === "custom_days" ? Number(customDays) : null,
        },
        { onConflict: "leader_id,rank" },
      );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${rank} default saved`);
    setAmountNgn("");
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("rank_upkeep_defaults").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Default removed");
    onChanged();
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <h2 className="text-base font-semibold">Rank upkeep defaults</h2>
      <p className="text-sm text-muted-foreground">
        Set a default stipend per rank in Naira. When you schedule upkeep for a member, it pre-fills from
        their rank.
      </p>

      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Rank</Label>
          <Select value={rank} onValueChange={setRank}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANKS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Amount (NGN)</Label>
          <Input
            type="number"
            step="1"
            min="1"
            value={amountNgn}
            onChange={(e) => setAmountNgn(e.target.value)}
            required
          />
          {Number(amountNgn) > 0 && (
            <p className="text-[10px] text-muted-foreground">≈ {fmtUsd(Number(amountNgn) / rate)}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Frequency</Label>
          <Select value={freq} onValueChange={(v) => setFreq(v as UpkeepFrequency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(FREQ_LABEL) as UpkeepFrequency[]).map((k) => (
                <SelectItem key={k} value={k}>{FREQ_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {freq === "custom_days" && (
          <div className="space-y-1.5">
            <Label>Every N days</Label>
            <Input type="number" min="1" value={customDays} onChange={(e) => setCustomDays(e.target.value)} />
          </div>
        )}
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">
            <Plus className="mr-1 size-3.5" /> Save
          </Button>
        </div>
      </form>

      <div className="mt-5 divide-y rounded-xl border">
        {defaults.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No rank defaults configured yet.
          </p>
        ) : (
          defaults.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{d.rank}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtNgn(d.amount_usd, rate)} <span className="opacity-60">({fmtUsd(d.amount_usd)})</span> · {FREQ_LABEL[d.frequency]}
                  {d.frequency === "custom_days" && d.custom_days ? ` (${d.custom_days} days)` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(d.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
