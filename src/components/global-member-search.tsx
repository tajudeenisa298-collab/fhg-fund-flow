import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth-context";
import { MemberDetailDialog } from "@/components/dashboard/member-detail-dialog";

/**
 * Global ⌘K / Ctrl-K member search. Searches the caller's downline
 * (their team plus themselves) by name, email, or whatsapp. Selecting a
 * result opens the existing MemberDetailDialog.
 *
 * Mounted once in the dashboard layout.
 */
export function GlobalMemberSearch() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);

  // ⌘K / Ctrl-K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Search downline (RLS allows leader to read own team + self)
  useEffect(() => {
    if (!open || !profile) return;
    const q = query.trim();
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      let req = supabase
        .from("profiles")
        .select("*")
        .or(`leader_id.eq.${profile.id},id.eq.${profile.id}`)
        .limit(25);
      if (q.length > 0) {
        const safe = q.replace(/[%,()]/g, " ");
        req = req.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%,whatsapp_number.ilike.%${safe}%`,
        );
      }
      const { data } = await req.order("full_name", { ascending: true });
      if (!cancelled) {
        setResults((data as Profile[]) ?? []);
        setLoading(false);
      }
    };
    const t = setTimeout(run, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, profile]);

  const grouped = useMemo(() => {
    if (!profile) return { self: [] as Profile[], team: [] as Profile[] };
    return {
      self: results.filter((r) => r.id === profile.id),
      team: results.filter((r) => r.id !== profile.id),
    };
  }, [results, profile]);

  if (!profile) return null;

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search members by name, email, or WhatsApp…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-md px-2 py-2">
                  <Skeleton className="size-7 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && results.length === 0 && (
            <CommandEmpty>No members found.</CommandEmpty>
          )}
          {grouped.self.length > 0 && (
            <CommandGroup heading="You">
              {grouped.self.map((m) => (
                <ResultItem key={m.id} m={m} onPick={(p) => { setOpen(false); setSelected(p); }} />
              ))}
            </CommandGroup>
          )}
          {grouped.team.length > 0 && (
            <CommandGroup heading="Your team">
              {grouped.team.map((m) => (
                <ResultItem key={m.id} m={m} onPick={(p) => { setOpen(false); setSelected(p); }} />
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      <MemberDetailDialog
        member={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </>
  );
}

function ResultItem({ m, onPick }: { m: Profile; onPick: (p: Profile) => void }) {
  return (
    <CommandItem
      // cmdk filters by `value`; include searchable fields so its built-in
      // fuzzy match keeps working alongside our server query.
      value={`${m.full_name} ${m.email ?? ""} ${m.whatsapp_number ?? ""}`}
      onSelect={() => onPick(m)}
      className="gap-3"
    >
      <UserAvatar name={m.full_name} avatarPath={m.avatar_url} className="size-7" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {m.email ?? m.whatsapp_number ?? "—"}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{m.rank}</span>
    </CommandItem>
  );
}

/** Trigger button (shown in the header). */
export function GlobalMemberSearchTrigger() {
  const onClick = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  };
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label="Search members (⌘K)"
      title="Search members (⌘K)"
    >
      <Search className="size-4" />
    </Button>
  );
}
