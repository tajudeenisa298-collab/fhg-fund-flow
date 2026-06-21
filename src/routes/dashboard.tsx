import { createFileRoute, useNavigate, Outlet, useRouterState, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Wallet, LogOut, Settings, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { DashboardBootSkeleton } from "@/components/dashboard/loading-screens";

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
  const {
    session,
    profile,
    roles,
    activeRole,
    setActiveRole,
    loading,
    signOut,
    fundHandlerMfaRequired,
    fundHandlerMfaSetupRequired,
  } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = sectionFromPath(pathname);

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [loading, session, nav]);

  if (loading || !profile) {
    return <DashboardBootSkeleton />;
  }

  if (isAccountBlocked(profile)) {
    return <AccountStatusScreen profile={profile} />;
  }

  if (fundHandlerMfaRequired || fundHandlerMfaSetupRequired) {
    return (
      <FundHandlerSecurityGate
        mode={fundHandlerMfaRequired ? "verify" : "setup"}
        onSignOut={async () => {
          await signOut();
          nav({ to: "/" });
        }}
      />
    );
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

function FundHandlerSecurityGate({
  mode,
  onSignOut,
}: {
  mode: "verify" | "setup";
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft px-4">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-card">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10">
          <ShieldCheck className="size-6 text-primary" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Extra security required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "verify"
            ? "This fund-handling account must finish two-factor authentication before opening fund tools."
            : "This fund-handling account must set up two-factor authentication before opening fund tools."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link to={mode === "verify" ? "/login" : "/settings"} hash={mode === "setup" ? "security" : undefined}>
              {mode === "verify" ? "Verify again" : "Set up authenticator"}
            </Link>
          </Button>
          <Button variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </section>
    </div>
  );
}
