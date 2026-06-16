import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fmtUsd, fmtDate } from "@/lib/format";
import { UserAvatar } from "@/components/user-avatar";

type Status = "pending" | "acknowledged" | "disputed";

interface Row {
  id: string;
  member_id: string;
  amount_usd: number;
  screenshot_path: string | null;
  note: string | null;
  status: Status;
  dispute_note: string | null;
  acknowledged_at: string | null;
  created_at: string;
  member_name?: string;
  member_avatar?: string | null;
}

const STATUS_META: Record<Status, { label: string; Icon: typeof Clock; cls: string }> = {
  pending: { label: "Pending", Icon: Clock, cls: "text-warning" },
  acknowledged: { label: "Approved", Icon: CheckCircle2, cls: "text-success" },
  disputed: { label: "Disputed", Icon: AlertTriangle, cls: "text-destructive" },
};

export function LeaderDispensationsSection({ leaderId }: { leaderId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<Status>("pending");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("upkeep_dispensations")
      .select(
        "id, member_id, amount_usd, screenshot_path, note, status, dispute_note, acknowledged_at, created_at",
      )
      .eq("leader_id", leaderId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list = (data as Row[]) ?? [];
    const ids = Array.from(new Set(list.map((r) => r.member_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      const map = new Map(
        (profs ?? []).map((p) => [
          p.id as string,
          { name: p.full_name as string, avatar: (p.avatar_url as string | null) ?? null },
        ]),
      );
      list.forEach((r) => {
        const m = map.get(r.member_id);
        r.member_name = m?.name;
        r.member_avatar = m?.avatar ?? null;
      });
    }
    setRows(list);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`leader-disp:${leaderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "upkeep_dispensations", filter: `leader_id=eq.${leaderId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId]);

  const viewProof = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("upkeep-proofs")
      .createSignedUrl(path, 300);
    if (error || !data) return toast.error("Couldn't load screenshot");
    setPreviewUrl(data.signedUrl);
  };

  const filtered = rows.filter((r) => r.status === tab);
  const counts: Record<Status, number> = {
    pending: rows.filter((r) => r.status === "pending").length,
    acknowledged: rows.filter((r) => r.status === "acknowledged").length,
    disputed: rows.filter((r) => r.status === "disputed").length,
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Upkeep dispensations</h2>
          <p className="text-sm text-muted-foreground">
            Track what you've paid out, what members confirmed, and what's in dispute.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)} className="mt-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending{counts.pending > 0 && ` · ${counts.pending}`}
          </TabsTrigger>
          <TabsTrigger value="acknowledged">
            Approved{counts.acknowledged > 0 && ` · ${counts.acknowledged}`}
          </TabsTrigger>
          <TabsTrigger value="disputed">
            Disputed{counts.disputed > 0 && ` · ${counts.disputed}`}
          </TabsTrigger>
        </TabsList>

        {(["pending", "acknowledged", "disputed"] as Status[]).map((s) => (
          <TabsContent key={s} value={s} className="mt-4 space-y-3">
            {filtered.length === 0 && tab === s ? (
              <p className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nothing here yet.
              </p>
            ) : tab === s ? (
              filtered.map((d) => {
                const meta = STATUS_META[d.status];
                return (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <UserAvatar
                        path={d.member_avatar ?? null}
                        name={d.member_name ?? "?"}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {fmtUsd(d.amount_usd)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            to {d.member_name ?? "member"}
                          </span>
                        </p>
                        {d.note && (
                          <p className="mt-1 text-sm text-muted-foreground">{d.note}</p>
                        )}
                        {d.status === "disputed" && d.dispute_note && (
                          <p className="mt-1 text-sm text-destructive">
                            Dispute: {d.dispute_note}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtDate(d.created_at)}
                          {d.status === "acknowledged" && d.acknowledged_at && (
                            <> · approved {fmtDate(d.acknowledged_at)}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.cls}`}>
                        <meta.Icon className="size-3.5" />
                        {meta.label}
                      </span>
                      {d.screenshot_path && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => viewProof(d.screenshot_path!)}
                        >
                          <ImageIcon className="mr-1 size-3.5" /> Proof
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : null}
          </TabsContent>
        ))}
      </Tabs>

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
    </section>
  );
}
