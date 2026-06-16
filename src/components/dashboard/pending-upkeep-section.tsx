import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { fmtUsd, fmtDate } from "@/lib/format";
import { DisputeThread } from "@/components/dashboard/dispute-thread";

interface Dispensation {
  id: string;
  leader_id: string;
  amount_usd: number;
  screenshot_path: string | null;
  note: string | null;
  status: "pending" | "acknowledged" | "disputed";
  created_at: string;
  leader_name?: string;
}

export function PendingUpkeepSection({
  memberId,
  onChanged,
}: {
  memberId: string;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Dispensation[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("upkeep_dispensations")
      .select("id, leader_id, amount_usd, screenshot_path, note, status, created_at")
      .eq("member_id", memberId)
      .in("status", ["pending", "disputed"])
      .order("created_at", { ascending: false });
    const rows = (data as Dispensation[]) ?? [];
    // Hydrate leader names
    const ids = Array.from(new Set(rows.map((r) => r.leader_id)));
    if (ids.length) {
      const { data: names } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map = new Map((names ?? []).map((n) => [n.id as string, n.full_name as string]));
      rows.forEach((r) => (r.leader_name = map.get(r.leader_id)));
    }
    setItems(rows);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`pending-upkeep:${memberId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "upkeep_dispensations", filter: `member_id=eq.${memberId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const viewProof = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("upkeep-proofs")
      .createSignedUrl(path, 300);
    if (error || !data) return toast.error("Couldn't load screenshot");
    setPreviewUrl(data.signedUrl);
  };

  const approve = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("acknowledge_upkeep", { _dispensation_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Upkeep approved — credited to your balance");
    load();
    onChanged?.();
  };

  const dispute = async () => {
    if (!disputing) return;
    if (disputeReason.trim().length < 3) return toast.error("Please add a brief reason");
    setBusy(true);
    const { error } = await supabase.rpc("dispute_upkeep", {
      _dispensation_id: disputing,
      _reason: disputeReason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Dispute sent to your leader");
    setDisputing(null);
    setDisputeReason("");
  };

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border-2 border-warning/40 bg-warning/5 p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Upkeep awaiting your approval</h2>
          <p className="text-sm text-muted-foreground">
            Confirm receipt to credit your balance, dispute if something's off, or continue an open dispute below.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {fmtUsd(d.amount_usd)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  from {d.leader_name ?? "your leader"}
                </span>
              </p>
              {d.note && <p className="mt-1 text-sm text-muted-foreground">{d.note}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{fmtDate(d.created_at)}</p>
              {d.screenshot_path && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 px-2"
                  onClick={() => viewProof(d.screenshot_path!)}
                >
                  <ImageIcon className="mr-1 size-3.5" /> View proof
                </Button>
              )}
            </div>
            {d.status === "pending" ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approve(d.id)} disabled={busy}>
                  <Check className="mr-1 size-3.5" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDisputing(d.id)}
                  disabled={busy}
                >
                  <X className="mr-1 size-3.5" /> Dispute
                </Button>
              </div>
            ) : (
              <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                Disputed
              </span>
            )}
            {d.status === "disputed" && (
              <div className="w-full">
                <DisputeThread dispensationId={d.id} currentUserId={memberId} canPost={true} />
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(v) => !v && setPreviewUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment proof</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Upkeep payment proof"
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!disputing} onOpenChange={(v) => !v && setDisputing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute upkeep</DialogTitle>
            <DialogDescription>Let your leader know what's wrong.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dr">Reason</Label>
            <Textarea
              id="dr"
              rows={3}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. The amount received was different"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={dispute} disabled={busy}>
              {busy ? "Sending…" : "Send dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
