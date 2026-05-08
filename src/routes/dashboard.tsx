import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Wallet, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { MemberView } from "@/components/dashboard/member-view";
import { LeaderView } from "@/components/dashboard/leader-view";

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
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
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
          <div className="flex items-center gap-3">
            {showSwitcher && (
              <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as "member" | "leader")}>
                <TabsList>
                  <TabsTrigger value="member">My funds</TabsTrigger>
                  <TabsTrigger value="leader">My team</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium leading-tight">{profile.full_name}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
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
