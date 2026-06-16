import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Notification } from "@/lib/types";

const fmtAgo = (s: string) => {
  const ms = Date.now() - new Date(s).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export function NotificationBell() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const userId = session?.user?.id;

  const load = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as Notification[]) ?? []);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    const ch = supabase
      .channel(`notifs:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAll = async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    const prev = items;
    // optimistic: flip everything to read locally
    setItems((cur) => cur.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null)
      .eq("user_id", userId);
    if (error) {
      setItems(prev);
      // surface failure quietly — realtime will reconcile if the write actually landed
      console.error("mark all read failed", error);
    }
  };

  const click = async (n: Notification) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      const prev = items;
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("id", n.id);
      if (error) setItems(prev);
    }
    setOpen(false);
    if (n.link) nav({ to: n.link });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll} className="h-7 px-2 text-xs">
              <CheckCheck className="mr-1 size-3" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => click(n)}
                    className="flex w-full items-start gap-2 px-3 py-3 text-left transition hover:bg-muted/40"
                  >
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        n.read_at ? "bg-transparent" : "bg-primary"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {n.body && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      )}
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {fmtAgo(n.created_at)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-center text-xs"
            onClick={() => {
              setOpen(false);
              nav({ to: "/notifications" });
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
