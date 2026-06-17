import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, Wallet, Building2, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DashboardSection = "overview" | "team" | "money" | "office" | "admin";

type Item = { to: string; label: string; section: DashboardSection; icon: LucideIcon };

const ALL_ITEMS: Item[] = [
  { to: "/dashboard", label: "Overview", section: "overview", icon: LayoutDashboard },
  { to: "/dashboard/team", label: "Team", section: "team", icon: Users },
  { to: "/dashboard/money", label: "Money", section: "money", icon: Wallet },
  { to: "/dashboard/office", label: "Office", section: "office", icon: Building2 },
  { to: "/dashboard/admin", label: "Admin", section: "admin", icon: Shield },
];

export function sectionFromPath(pathname: string): DashboardSection {
  if (pathname.startsWith("/dashboard/team")) return "team";
  if (pathname.startsWith("/dashboard/money")) return "money";
  if (pathname.startsWith("/dashboard/office")) return "office";
  if (pathname.startsWith("/dashboard/admin")) return "admin";
  return "overview";
}

export function DashboardSubNav({ role }: { role: "member" | "leader" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = sectionFromPath(pathname);
  const items = ALL_ITEMS.filter((i) => role === "leader" || i.section !== "office");

  return (
    <>
      {/* Desktop / tablet: sticky pill bar under header */}
      <nav
        aria-label="Dashboard sections"
        className="sticky top-0 z-20 hidden border-b bg-card/80 backdrop-blur md:block"
      >
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 md:px-6">
          {items.map((i) => {
            const isActive = active === i.section;
            return (
              <Link
                key={i.to}
                to={i.to}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <i.icon className="size-4" />
                {i.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile: bottom tab bar */}
      <nav
        aria-label="Dashboard sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-6xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((i) => {
            const isActive = active === i.section;
            return (
              <Link
                key={i.to}
                to={i.to}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <i.icon className={`size-5 ${isActive ? "" : "opacity-80"}`} />
                {i.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
