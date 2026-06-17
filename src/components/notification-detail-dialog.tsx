import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Notification } from "@/lib/types";
import { fmtDate } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  generic: "General",
  deposit: "Money",
  fund_deduction: "Money",
  request_new: "Withdrawal",
  request_resolved: "Withdrawal",
  upkeep: "Upkeep",
  bank_updated: "Account",
  fund_rule_changed: "Team rule",
  fx_rate_changed: "Exchange rate",
  security: "Security",
  system: "System",
};

export function NotificationDetailDialog({
  notification,
  open,
  onOpenChange,
}: {
  notification: Notification | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const nav = useNavigate();
  if (!notification) return null;
  const kindLabel = KIND_LABEL[notification.kind] ?? notification.kind;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
              {kindLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              {fmtDate(notification.created_at)}
            </span>
          </div>
          <DialogTitle>{notification.title}</DialogTitle>
          {notification.body && (
            <DialogDescription className="whitespace-pre-wrap text-foreground/80">
              {notification.body}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {notification.link && (
            <Button
              onClick={() => {
                onOpenChange(false);
                nav({ to: notification.link! });
              }}
            >
              <ExternalLink className="mr-1.5 size-4" />
              Go to page
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
