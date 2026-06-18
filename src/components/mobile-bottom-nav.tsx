import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Bell, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const TABS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/notifications", label: "Inbox", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Sticky bottom tab bar shown only on small screens and only when signed in.
 * Hides on scroll-down, reappears on scroll-up. Hidden on auth pages.
 */
export function MobileBottomNav() {
  const { session } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    lastY.current = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        if (Math.abs(dy) > 6) {
          // Show near the top regardless of direction.
          if (y < 24) setHidden(false);
          else setHidden(dy > 0);
          lastY.current = y;
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!session) return null;
  if (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    // Dashboard already shows its own section tab bar at the bottom on
    // mobile (Team / Structure / Money / Office / Admin), so we hide this
    // generic Home / Inbox / Settings bar there to avoid stacked nav bars.
    path.startsWith("/dashboard")
  ) {
    return null;
  }

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur transition-transform duration-200 ease-out md:hidden ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
      aria-hidden={hidden}
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = path === t.to || path.startsWith(`${t.to}/`);
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                tabIndex={hidden ? -1 : 0}
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
