import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Bell, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const TABS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/notifications", label: "Inbox", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Sticky bottom tab bar shown only on small screens and only when signed in.
 * Hidden on auth pages (/login, /signup, etc).
 */
export function MobileBottomNav() {
  const { session } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!session) return null;
  // Don't show on landing or auth flows
  if (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password")
  ) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = path === t.to || path.startsWith(`${t.to}/`);
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-xs ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-5" />
                <span className="font-medium">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
