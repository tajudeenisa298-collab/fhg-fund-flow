import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, Trash2, ExternalLink, FileText, Link as LinkIcon, FileDown, Pencil } from "lucide-react";
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
import { fmtDate } from "@/lib/format";
import type { Resource, ResourceKind } from "@/lib/types";
import { usePagedList, ShowMoreButton } from "@/components/paged-list";

const KIND_ICON: Record<ResourceKind, typeof LinkIcon> = {
  link: LinkIcon,
  file: FileDown,
  note: FileText,
};
const KIND_LABEL: Record<ResourceKind, string> = {
  link: "Link",
  file: "File",
  note: "Note",
};

const DEFAULT_CATEGORIES = [
  "NeoLife product guide",
  "FHG freelancing tip",
  "Training material",
  "Compliance",
  "Other",
];

export function ResourceLibrarySection({
  leaderId,
  canManage,
}: {
  leaderId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<Resource[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("resources")
      .select("*")
      .eq("leader_id", leaderId)
      .order("created_at", { ascending: false });
    setItems((data as Resource[]) ?? []);
  };

  useEffect(() => {
    if (!leaderId) return;
    load();
    const ch = supabase
      .channel(`resources:${leaderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resources", filter: `leader_id=eq.${leaderId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId]);

  const page = usePagedList(items, 8);

  const remove = async (r: Resource) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    if (r.storage_path) {
      await supabase.storage.from("team-resources").remove([r.storage_path]);
    }
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  };

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("team-resources")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Could not open file");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Resource library</h2>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "Share training materials, NeoLife product guides, and FHG freelancing tips."
                : "Training materials, product guides, and freelancing tips from your team leader."}
            </p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-1 size-4" /> Add resource
          </Button>
        )}
      </div>

      <ul className="mt-4 divide-y rounded-xl border">
        {items.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            {canManage
              ? "No resources yet. Add a link, upload a file, or write a quick guide."
              : "Nothing here yet."}
          </li>
        )}
        {page.slice.map((r) => {
          const Icon = KIND_ICON[r.kind];
          return (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  <Icon className="size-4 text-muted-foreground" />
                  {r.title}
                  {r.category && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {r.category}
                    </span>
                  )}
                </p>
                {r.kind === "note" && r.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>
                )}
                {r.kind === "link" && r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {r.url} <ExternalLink className="size-3" />
                  </a>
                )}
                {r.kind === "file" && r.storage_path && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    onClick={() => openFile(r.storage_path!)}
                  >
                    Download / open
                  </Button>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
              </div>
              {canManage && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }} title="Edit">
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(r)} title="Delete">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
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

      {canManage && (
        <ResourceDialog
          open={open}
          onOpenChange={setOpen}
          leaderId={leaderId}
          existing={editing}
        />
      )}
    </section>
  );
}

function ResourceDialog({
  open,
  onOpenChange,
  leaderId,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaderId: string;
  existing: Resource | null;
}) {
  const [kind, setKind] = useState<ResourceKind>("link");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORIES[0]);
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (existing) {
      setKind(existing.kind);
      setTitle(existing.title);
      setCategory(existing.category ?? DEFAULT_CATEGORIES[0]);
      setUrl(existing.url ?? "");
      setBody(existing.body ?? "");
      setFile(null);
    } else {
      setKind("link");
      setTitle("");
      setCategory(DEFAULT_CATEGORIES[0]);
      setUrl("");
      setBody("");
      setFile(null);
    }
  }, [existing, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      let storage_path: string | null = existing?.storage_path ?? null;

      if (kind === "link" && !url.trim()) throw new Error("URL required");
      if (kind === "note" && !body.trim()) throw new Error("Note text required");

      if (kind === "file") {
        if (file) {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${leaderId}/${crypto.randomUUID()}-${safe}`;
          const { error: upErr } = await supabase.storage
            .from("team-resources")
            .upload(path, file, { upsert: false });
          if (upErr) throw upErr;
          if (existing?.storage_path) {
            await supabase.storage.from("team-resources").remove([existing.storage_path]);
          }
          storage_path = path;
        } else if (!storage_path) {
          throw new Error("Choose a file to upload");
        }
      }

      const payload = {
        leader_id: leaderId,
        title: title.trim(),
        kind,
        category: category.trim() || null,
        url: kind === "link" ? url.trim() : null,
        body: kind === "note" ? body.trim() : null,
        storage_path: kind === "file" ? storage_path : null,
      };

      const { error } = existing
        ? await supabase.from("resources").update(payload).eq("id", existing.id)
        : await supabase.from("resources").insert(payload);
      if (error) throw error;

      toast.success(existing ? "Resource updated" : "Resource added");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save resource");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit resource" : "New resource"}</DialogTitle>
          <DialogDescription>
            Share a useful link, upload a PDF/image/video, or write a quick guide for your team.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ResourceKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="res-title">Title</Label>
            <Input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === "link" && (
            <div className="space-y-2">
              <Label htmlFor="res-url">URL</Label>
              <Input
                id="res-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                required
              />
            </div>
          )}
          {kind === "note" && (
            <div className="space-y-2">
              <Label htmlFor="res-body">Note</Label>
              <Textarea
                id="res-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>
          )}
          {kind === "file" && (
            <div className="space-y-2">
              <Label htmlFor="res-file">
                File {existing?.storage_path && "(leave empty to keep existing)"}
              </Label>
              <Input
                id="res-file"
                type="file"
                ref={fileRef}
                accept="application/pdf,image/*,video/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">PDF, images, video, or office docs.</p>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : existing ? "Save changes" : "Add resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
