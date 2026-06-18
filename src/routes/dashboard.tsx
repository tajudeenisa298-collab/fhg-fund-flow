import { createFileRoute, useNavigate, Outlet, useRouterState, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Wallet, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, isAccountBlocked } from "@/lib/auth-context";
import { MemberView } from "@/components/dashboard/member-view";
import { LeaderView } from "@/components/dashboard/leader-view";
import { StructureSection } from "@/components/dashboard/structure-section";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalMemberSearch, GlobalMemberSearchTrigger } from "@/components/global-member-search";
import { UserAvatar } from "@/components/user-avatar";
import { AccountStatusScreen } from "@/components/account-status-screen";
import { DashboardSubNav, sectionFromPath } from "@/components/dashboard/dashboard-sub-nav";
import { EmergencyAnnouncementPopup } from "@/components/emergency-announcement-popup";

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = sectionFromPath(pathname);

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
    <div className="min-h-screen bg-gradient-soft pb-20 md:pb-0">
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
            <GlobalMemberSearchTrigger />
            <NotificationBell />
            <Button variant="outline" size="icon" asChild aria-label="Settings">
              <Link to="/settings"><Settings className="size-4" /></Link>
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

      <DashboardSubNav role={activeRole} />

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {section === "structure" ? (
          <StructureSection profile={profile} />
        ) : activeRole === "leader" ? (
          <LeaderView profile={profile} section={section} />
        ) : (
          <MemberView profile={profile} section={section} />
        )}
        {/* Child routes are URL markers only — render null so the parent
            stays mounted and data isn't re-fetched on every tab switch. */}
        <Outlet />
      </main>
      <GlobalMemberSearch />
      <EmergencyAnnouncementPopup />
    </div>
  );
}
