import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface InviteCodeRowData {
  id: string;
  code: string;
  expires_at: string;
  is_used: boolean;
  revoked: boolean;
}

/** Returns null when code is no longer valid (used, revoked, or expired). */
export function InviteCodeRow({
  code,
  onExpired,
}: {
  code: InviteCodeRowData;
  onExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expiresMs = new Date(code.expires_at).getTime();
  const remaining = Math.max(0, Math.floor((expiresMs - now) / 1000));
  const expired = remaining === 0;
  const used = code.is_used;
  const revoked = code.revoked;

  useEffect(() => {
    if (expired && !used && !revoked) onExpired();
  }, [expired, used, revoked, onExpired]);

  // Hide entirely once unusable
  if (used || revoked || expired) return null;

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const urgent = remaining < 60;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm">{code.code}</code>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
            urgent ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"
          }`}
        >
          {mm}:{ss}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(code.code);
          toast.success(`Copied ${code.code}`);
        }}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}
