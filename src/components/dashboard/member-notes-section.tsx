import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StickyNote, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtDate } from "@/lib/format";

interface Note {
  id: string;
  body: string;
  tags: string[];
  created_at: string;
}

export function MemberNotesSection({ memberId }: { memberId: string }) {
  const { profile } = useAuth();
  const leaderId = profile?.id;
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("member_notes")
      .select("id, body, tags, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });
    setNotes((data as Note[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const save = async () => {
    if (!leaderId) return;
    const text = body.trim();
    if (text.length < 1) return toast.error("Note can't be empty");
    setBusy(true);
    const tagList = tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
    const { error } = await supabase.from("member_notes").insert({
      leader_id: leaderId,
      member_id: memberId,
      body: text,
      tags: tagList,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setBody("");
    setTags("");
    toast.success("Note saved");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("member_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <StickyNote className="size-3.5" /> Private notes
      </h4>
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <Label htmlFor="note-body" className="text-xs">Add a note</Label>
        <Textarea
          id="note-body"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder="Observations, follow-ups, context… visible only to you."
        />
        <div className="flex flex-wrap gap-2">
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags (comma separated, e.g. follow-up, vip)"
            className="flex-1 text-xs"
            maxLength={200}
          />
          <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
            {busy ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {notes.length === 0 && (
          <li className="rounded-xl border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
            No notes yet.
          </li>
        )}
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap leading-snug">{n.body}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive"
                onClick={() => remove(n.id)}
                title="Delete note"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {n.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                >
                  <Tag className="size-2.5" /> {t}
                </span>
              ))}
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                {fmtDate(n.created_at)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
