import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Settings = {
  dual_approval_threshold_usd: number;
  member_daily_withdrawal_cap_usd: number;
  member_weekly_withdrawal_cap_usd: number;
  member_daily_upkeep_cap_usd: number;
  deposit_reversal_window_hours: number;
};

export function MoneySafetyButton({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("app_settings")
      .select(
        "dual_approval_threshold_usd, member_daily_withdrawal_cap_usd, member_weekly_withdrawal_cap_usd, member_daily_upkeep_cap_usd, deposit_reversal_window_hours",
      )
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return toast.error(error.message);
        if (data) setS(data as Settings);
      });
  }, [open]);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ ...s, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Money-safety limits saved");
    setOpen(false);
    onSaved?.();
  };

  const field = (key: keyof Settings, label: string, hint: string, step = "1") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        step={step}
        min="0"
        value={s?.[key] ?? 0}
        onChange={(e) => s && setS({ ...s, [key]: Number(e.target.value) })}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldCheck className="mr-1.5 size-3.5" /> Money safety
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Money safety limits</DialogTitle>
            <DialogDescription>
              Configurable thresholds and caps applied team-wide. Set 0 to disable a cap.
            </DialogDescription>
          </DialogHeader>
          {s ? (
            <div className="space-y-4">
              {field(
                "dual_approval_threshold_usd",
                "Two-leader approval threshold ($)",
                "Withdrawals at or above this require a second leader's approval.",
              )}
              {field(
                "member_daily_withdrawal_cap_usd",
                "Daily withdrawal cap per member ($)",
                "Total withdrawal requests a member can submit in 24h.",
              )}
              {field(
                "member_weekly_withdrawal_cap_usd",
                "Weekly withdrawal cap per member ($)",
                "Rolling 7-day cap on withdrawal requests.",
              )}
              {field(
                "member_daily_upkeep_cap_usd",
                "Daily upkeep cap per member ($)",
                "Max upkeep a leader can dispense to one member in 24h.",
              )}
              {field(
                "deposit_reversal_window_hours",
                "Deposit reversal window (hours)",
                "One-click 'Undo' is available on deposits for this many hours.",
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !s}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
