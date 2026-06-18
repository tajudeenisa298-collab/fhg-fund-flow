import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtDate } from "@/lib/format";

interface EmergencyAnnouncement {
  id: string;
  leader_id: string;
  title: string;
  body: string;
  created_at: string;
  expires_at: string | null;
}

const DISMISSED_KEY = "fhg:emergency-dismissed";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

/**
 * Shows the most recent un-expired emergency announcement once per user,
 * persisted via localStorage. Closing it permanently dismisses it.
 */
export function EmergencyAnnouncementPopup() {
  const { profile } = useAuth();
  const leaderId = profile?.leader_id ?? profile?.id ?? null;
  const [pending, setPending] = useState<EmergencyAnnouncement | null>(null);

  useEffect(() => {
    if (!leaderId) return;
    let cancelled = false;
    const dismissed = readDismissed();
    const nowIso = new Date().toISOString();

    supabase
      .from("announcements")
      .select("id, leader_id, title, body, created_at, expires_at, is_emergency")
      .eq("leader_id", leaderId)
      .eq("is_emergency", true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (cancelled) return;
        const fresh = (data ?? []).find((a) => !dismissed.has(a.id));
        if (fresh) setPending(fresh as EmergencyAnnouncement);
      });
    return () => {
      cancelled = true;
    };
  }, [leaderId]);

  if (!pending) return null;

  const close = () => {
    const dismissed = readDismissed();
    dismissed.add(pending.id);
    writeDismissed(dismissed);
    setPending(null);
  };

  return (
    <Dialog open={true} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">
            Emergency: {pending.title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-center text-foreground/80">
            {pending.body}
          </DialogDescription>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Posted {fmtDate(pending.created_at)}
            {pending.expires_at && (
              <> · Valid until {fmtDate(pending.expires_at)}</>
            )}
          </p>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={close}>
            Got it, close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
