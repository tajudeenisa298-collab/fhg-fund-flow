import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical, Ban, ShieldOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { Profile } from "@/lib/auth-context";

type Mode = "suspend" | "terminate" | "pardon" | null;

const DURATIONS: { value: string; label: string; days: number }[] = [
  { value: "1", label: "1 day", days: 1 },
  { value: "3", label: "3 days", days: 3 },
  { value: "7", label: "7 days", days: 7 },
  { value: "14", label: "14 days", days: 14 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "custom", label: "Custom…", days: 0 },
];

export function MemberStatusMenu({
  member,
  onDone,
}: {
  member: Profile;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [durKey, setDurKey] = useState("7");
  const [customDays, setCustomDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const isSuspended =
    !!member.suspended_until && new Date(member.suspended_until) > new Date();
  const isTerminated = !!member.terminated_at;
  const terminationPermanent =
    isTerminated &&
    new Date(member.terminated_at!).getTime() < Date.now() - 90 * 86400 * 1000;

  const close = () => {
    setMode(null);
    setReason("");
    setDurKey("7");
    setCustomDays(7);
  };

  const submitSuspend = async () => {
    const days =
      durKey === "custom" ? Math.max(1, Math.floor(customDays)) : Number(durKey);
    if (!Number.isFinite(days) || days <= 0) {
      toast.error("Enter a valid number of days");
      return;
    }
    setBusy(true);
    const until = new Date(Date.now() + days * 86400 * 1000).toISOString();
    const { error } = await supabase.rpc("suspend_member", {
      _member_id: member.id,
      _until: until,
      _reason: reason || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${member.full_name} suspended for ${days} day(s)`);
    close();
    onDone();
  };

  const submitTerminate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("terminate_member", {
      _member_id: member.id,
      _reason: reason || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${member.full_name} terminated`);
    close();
    onDone();
  };

  const submitPardon = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("pardon_member", {
      _member_id: member.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${member.full_name} reinstated`);
    close();
    onDone();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Member actions">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(isSuspended || isTerminated) && !terminationPermanent && (
            <>
              <DropdownMenuItem onClick={() => setMode("pardon")}>
                <ShieldCheck className="mr-2 size-4" /> Pardon / Reinstate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            disabled={isTerminated}
            onClick={() => setMode("suspend")}
          >
            <Ban className="mr-2 size-4" /> Suspend…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={terminationPermanent}
            onClick={() => setMode("terminate")}
          >
            <ShieldOff className="mr-2 size-4" /> Terminate permanently…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Suspend dialog */}
      <Dialog open={mode === "suspend"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {member.full_name}</DialogTitle>
            <DialogDescription>
              They won't be able to sign in and their upkeep will be paused for
              the duration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={durKey} onValueChange={setDurKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {durKey === "custom" && (
                <Input
                  type="number"
                  min={1}
                  value={customDays}
                  onChange={(e) => setCustomDays(Number(e.target.value))}
                  placeholder="Days"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitSuspend} disabled={busy}>
              {busy ? "Suspending…" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate dialog */}
      <Dialog open={mode === "terminate"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate {member.full_name}?</DialogTitle>
            <DialogDescription>
              They will be locked out and upkeep stopped. You have 90 days to
              pardon them — after that the termination is permanent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitTerminate}
              disabled={busy}
            >
              {busy ? "Terminating…" : "Terminate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pardon confirm */}
      <Dialog open={mode === "pardon"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reinstate {member.full_name}?</DialogTitle>
            <DialogDescription>
              This lifts any suspension or termination and restores access.
              Upkeep plans remain paused — re-enable them manually if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitPardon} disabled={busy}>
              {busy ? "Reinstating…" : "Reinstate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MemberStatusBadge({ member }: { member: Profile }) {
  const isTerminated = !!member.terminated_at;
  const isSuspended =
    !!member.suspended_until && new Date(member.suspended_until) > new Date();
  if (!isTerminated && !isSuspended) return null;
  const permanent =
    isTerminated &&
    new Date(member.terminated_at!).getTime() < Date.now() - 90 * 86400 * 1000;
  const label = isTerminated
    ? permanent
      ? "Terminated (permanent)"
      : "Terminated"
    : `Suspended · until ${new Date(member.suspended_until!).toLocaleDateString()}`;
  return (
    <span className="ml-2 inline-block rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
      {label}
    </span>
  );
}
