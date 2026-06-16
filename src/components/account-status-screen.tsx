import { ShieldAlert, Ban, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, type Profile } from "@/lib/auth-context";
import { fmtDate } from "@/lib/format";

export function AccountStatusScreen({ profile }: { profile: Profile }) {
  const { signOut } = useAuth();
  const isTerminated = !!profile.terminated_at;
  const suspendedUntil = profile.suspended_until ? new Date(profile.suspended_until) : null;
  const isSuspended = !isTerminated && suspendedUntil && suspendedUntil > new Date();

  const finalized = !!(profile as Profile & { finalized_at?: string | null }).finalized_at;
  const pardonDeadline = profile.terminated_at
    ? new Date(new Date(profile.terminated_at).getTime() + 90 * 24 * 60 * 60 * 1000)
    : null;
  const pardonExpired = pardonDeadline ? pardonDeadline < new Date() : false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-elegant">
        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          {isTerminated ? <Ban className="size-7" /> : <ShieldAlert className="size-7" />}
        </div>
        <h1 className="text-2xl font-semibold">
          {isTerminated
            ? finalized || pardonExpired
              ? "Account permanently terminated"
              : "Account terminated"
            : "Account suspended"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isTerminated
            ? finalized || pardonExpired
              ? "The 90-day pardon window has passed. Please contact your team leader if you believe this is in error."
              : `You have until ${fmtDate(pardonDeadline!.toISOString())} to be pardoned by your team leader.`
            : isSuspended
            ? `Your access has been suspended until ${fmtDate(suspendedUntil!.toISOString())}.`
            : "Your account access is restricted."}
        </p>

        {(profile.terminated_reason || profile.suspended_reason) && (
          <div className="mt-5 rounded-lg border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reason</p>
            <p className="mt-1 text-sm">
              {profile.terminated_reason || profile.suspended_reason}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              await signOut();
              window.location.href = "/";
            }}
          >
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
