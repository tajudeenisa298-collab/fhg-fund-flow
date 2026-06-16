import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import type { Announcement } from "@/lib/types";
import { usePagedList, ShowMoreButton } from "@/components/paged-list";

export function AnnouncementsSection({
  leaderId,
  canManage,
}: {
  leaderId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("*")
      .eq("leader_id", leaderId)
      .order("created_at", { ascending: false });
    setItems((data as Announcement[]) ?? []);
  };

  useEffect(() => {
    if (!leaderId) return;
    load();
    const ch = supabase
      .channel(`announcements:${leaderId}`)
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

  const page = usePagedList(items, 5);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return toast.error("Title and message required");
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({
      leader_id: leaderId,
      title: title.trim(),
      body: body.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Announcement sent to your team");
    setTitle("");
    setBody("");
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
        {items.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            {canManage
              ? "No announcements yet. Post one to keep your team in the loop."
              : "Nothing here yet."}
          </li>
        )}
        {page.slice.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">{fmtDate(a.created_at)}</p>
            </div>
            {canManage && (
              <Button variant="ghost" size="icon" onClick={() => remove(a.id)} title="Delete">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </li>
        ))}
        <ShowMoreButton
          hasMore={page.hasMore}
          onClick={page.showMore}
          remaining={page.total - page.visible}
        />
      </ul>
    </section>
  );
}
