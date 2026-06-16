import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Msg = {
  id: string;
  dispensation_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export function DisputeThread({
  dispensationId,
  currentUserId,
  canPost,
}: {
  dispensationId: string;
  currentUserId: string;
  canPost: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("upkeep_dispute_messages" as never)
      .select("id, dispensation_id, author_id, body, created_at")
      .eq("dispensation_id", dispensationId)
      .order("created_at", { ascending: true });
    if (error) return;
    setMessages((data as unknown as Msg[]) ?? []);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`dispute-${dispensationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "upkeep_dispute_messages", filter: `dispensation_id=eq.${dispensationId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispensationId]);

  const post = async () => {
    const text = body.trim();
    if (text.length < 2) return toast.error("Add a message");
    setBusy(true);
    const { error } = await supabase
      .from("upkeep_dispute_messages" as never)
      .insert({ dispensation_id: dispensationId, author_id: currentUserId, body: text } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    setBody("");
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">Dispute thread</p>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">No messages yet.</p>
        )}
        {messages.map((m) => {
          const mine = m.author_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  mine ? "bg-primary text-primary-foreground" : "bg-card border"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {canPost && (
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Reply…"
            rows={2}
            className="text-sm"
          />
          <Button size="sm" onClick={post} disabled={busy}>
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
