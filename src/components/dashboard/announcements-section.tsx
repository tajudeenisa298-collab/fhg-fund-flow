import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import type { Announcement } from "@/lib/types";
import { usePagedList, ShowMoreButton } from "@/components/paged-list";
import { removeRealtimeChannelsByTopicPrefix } from "@/lib/realtime";

interface AnnouncementRow extends Announcement {
  expires_at: string | null;
  is_emergency: boolean;
}

export function AnnouncementsSection({
  leaderId,
  canManage,
}: {
  leaderId: string;
  canManage: boolean;
}) {
  const channelId = useRef(crypto.randomUUID());
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // local datetime-input value
  const [isEmergency, setIsEmergency] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("*")
      .eq("leader_id", leaderId)
      .order("created_at", { ascending: false });
    setItems((data as AnnouncementRow[]) ?? []);
  };

  useEffect(() => {
    if (!leaderId) return;
    load();
    removeRealtimeChannelsByTopicPrefix(supabase, `announcements:${leaderId}`);
    const ch = supabase
      .channel(`announcements:${leaderId}:${channelId.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements", filter: `leader_id=eq.${leaderId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId]);

  const now = Date.now();
  // Members only see currently-valid announcements; leaders see everything
  // (including expired ones) so they can audit / clean up.
  const visible = canManage
    ? items
    : items.filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now);

  const page = usePagedList(visible, 5);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return toast.error("Title and message required");
    let expiresIso: string | null = null;
    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return toast.error("Pick a valid expiry date & time");
      }
      if (parsed.getTime() <= Date.now()) {
        return toast.error("Expiry must be in the future");
      }
      expiresIso = parsed.toISOString();
    }
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({
      leader_id: leaderId,
      title: title.trim(),
      body: body.trim(),
      expires_at: expiresIso,
      is_emergency: isEmergency,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isEmergency ? "Emergency announcement sent" : "Announcement sent to your team");
    setTitle("");
    setBody("");
    setExpiresAt("");
    setIsEmergency(false);
    setOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">
              {canManage ? "Team announcements" : "Announcements from your team leader"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "Broadcast updates to your whole team. Members are notified instantly."
                : "Latest broadcasts from your team leader."}
            </p>
          </div>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 size-4" /> New announcement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Broadcast to your team</DialogTitle>
                <DialogDescription>
                  Every team member gets a notification with this message.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="a-title">Title</Label>
                  <Input
                    id="a-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-body">Message</Label>
                  <Textarea
                    id="a-body"
                    rows={5}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={2000}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-expires" className="flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    Valid until (optional)
                  </Label>
                  <Input
                    id="a-expires"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to keep the announcement visible forever.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-destructive/5 p-3">
                  <Switch
                    id="a-emergency"
                    checked={isEmergency}
                    onCheckedChange={setIsEmergency}
                  />
                  <div className="flex-1">
                    <Label htmlFor="a-emergency" className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="size-3.5 text-destructive" />
                      Emergency
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Pops up immediately the next time each member opens the app.
                      They can close it once and won't see it again.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Sending…" : "Send to team"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <ul className="mt-4 divide-y rounded-xl border">
        {visible.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            {canManage
              ? "No announcements yet. Post one to keep your team in the loop."
              : "Nothing here yet."}
          </li>
        )}
        {page.slice.map((a) => {
          const expired = !!a.expires_at && new Date(a.expires_at).getTime() <= now;
          return (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{a.title}</p>
                  {a.is_emergency && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                      <AlertTriangle className="size-3" /> Emergency
                    </span>
                  )}
                  {expired && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Expired
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {fmtDate(a.created_at)}
                  {a.expires_at && (
                    <>
                      {" "}· {expired ? "expired" : "valid until"} {fmtDate(a.expires_at)}
                    </>
                  )}
                </p>
              </div>
              {canManage && (
                <Button variant="ghost" size="icon" onClick={() => remove(a.id)} title="Delete">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </li>
          );
        })}
        <ShowMoreButton
          hasMore={page.hasMore}
          onClick={page.showMore}
          remaining={page.total - page.visible}
        />
      </ul>
    </section>
  );
}
