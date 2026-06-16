import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Wallet, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, isAccountBlocked } from "@/lib/auth-context";
import { MemberView } from "@/components/dashboard/member-view";
import { LeaderView } from "@/components/dashboard/leader-view";
import { NotificationBell } from "@/components/notification-bell";
import { UserAvatar } from "@/components/user-avatar";
import { AccountStatusScreen } from "@/components/account-status-screen";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FHG Funds" },
      { name: "description", content: "Your funds, team, and activity at a glance." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session, profile, roles, activeRole, setActiveRole, loading, signOut } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [loading, session, nav]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gradient-soft p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-80" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isAccountBlocked(profile)) {
    return <AccountStatusScreen profile={profile} />;
  }

  const showSwitcher = roles.length > 1;

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elegant">
              <Wallet className="size-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">FHG Funds</p>
              <p className="text-xs capitalize text-muted-foreground">
                {showSwitcher ? "member & leader" : activeRole}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showSwitcher && (
              <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as "member" | "leader")}>
                <TabsList>
                  <TabsTrigger value="member">My funds</TabsTrigger>
                  <TabsTrigger value="leader">My team</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <div className="hidden items-center gap-2 md:flex">
              <UserAvatar name={profile.full_name} avatarPath={profile.avatar_url} className="size-8" />
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground">{profile.email}</p>
              </div>
            </div>
            <NotificationBell />
            <Button variant="outline" size="icon" asChild aria-label="Settings">
              <a href="/settings"><Settings className="size-4" /></a>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                await signOut();
                nav({ to: "/" });
              }}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {activeRole === "leader" ? (
          <LeaderView profile={profile} />
        ) : (
          <MemberView profile={profile} />
        )}
      </main>
    </div>
  );
}
