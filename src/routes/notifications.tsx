import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Notification } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { NotificationDetailDialog } from "@/components/notification-detail-dialog";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — FHG Funds" },
      { name: "description", content: "Your notifications inbox." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Notification | null>(null);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [loading, session, nav]);

  const load = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data as Notification[]) ?? []);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    const ch = supabase
      .channel(`inbox:${userId}`)
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

  const unread = items.filter((n) => !n.read_at);

  const markAll = async () => {
    if (!userId || unread.length === 0) return;
    setBusy(true);
    const now = new Date().toISOString();
    const prev = items;
    setItems((cur) => cur.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null)
      .eq("user_id", userId);
    if (error) setItems(prev);
    setBusy(false);
  };

  const toggleRead = async (n: Notification) => {
    const next = n.read_at ? null : new Date().toISOString();
    const prev = items;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read_at: next } : x)));
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: next })
      .eq("id", n.id);
    if (error) setItems(prev);
  };

  const open = async (n: Notification) => {
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
    if (n.link) nav({ to: n.link });
  };

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/dashboard" })}>
            <ArrowLeft className="mr-1 size-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />
            <h1 className="text-base font-semibold">Notifications</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={markAll}
            disabled={busy || unread.length === 0}
          >
            <CheckCheck className="mr-1 size-4" />
            Mark all read
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
            <Bell className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No notifications yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You'll see deposits, requests, and team activity here.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-card">
            {items.map((n) => (
              <li
                key={n.id}
                className={`group flex items-start gap-3 p-4 transition hover:bg-muted/30 ${
                  n.read_at ? "" : "bg-primary/5"
                }`}
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    n.read_at ? "bg-muted-foreground/30" : "bg-primary"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => open(n)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-medium">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(n.created_at)}
                    {n.link && <span className="ml-2 text-primary">Open →</span>}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => toggleRead(n)}
                >
                  {n.read_at ? "Mark unread" : "Mark read"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
