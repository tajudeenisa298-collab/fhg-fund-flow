import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "member" | "leader";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  leader_id: string | null;
  sponsor_id: string | null;
  rank: string;
  balance_usd: number;
  can_handle_funds: boolean;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  whatsapp_number: string | null;
  payout_method: "bank_transfer" | "neolife_pv";
  avatar_url: string | null;
  suspended_until: string | null;
  suspended_reason: string | null;
  terminated_at: string | null;
  terminated_reason: string | null;
  finalized_at: string | null;
}

export function isAccountBlocked(p: Profile | null): boolean {
  if (!p) return false;
  if (p.terminated_at) return true;
  if (p.suspended_until && new Date(p.suspended_until) > new Date()) return true;
  return false;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isLeader: boolean;
  isMember: boolean;
  /** Active dashboard view when user has both roles */
  activeRole: AppRole;
  setActiveRole: (r: AppRole) => void;
  /** USD → NGN rate, app-wide setting */
  ngnRate: number;
  /** Multi-currency rates (per 1 USD) */
  fxRates: Record<string, number>;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRoleState] = useState<AppRole>("member");
  const [ngnRate, setNgnRate] = useState<number>(1600);
  const [fxRates, setFxRates] = useState<Record<string, number>>({
    USD: 1, NGN: 1600, GBP: 1.27, EUR: 1.08,
  });
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: p }, { data: r }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("app_settings").select("usd_to_ngn, fx_rates").eq("id", 1).maybeSingle(),
    ]);
    const prof = (p as Profile) ?? null;
    setProfile(prof);
    const list = ((r as { role: AppRole }[]) ?? []).map((x) => x.role);
    setRoles(list);
    if (s?.usd_to_ngn) setNgnRate(Number(s.usd_to_ngn));
    if (s?.fx_rates && typeof s.fx_rates === "object")
      setFxRates({ ...(s.fx_rates as Record<string, number>) });
    setActiveRoleState((prev) => {
      if (list.includes(prev)) return prev;
      return list.includes("leader") ? "leader" : "member";
    });
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadProfile(s.user.id), 0);
      else {
        setProfile(null);
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) await loadProfile(s.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Detect suspension/termination mid-session: re-check profile on focus,
  // periodically, and via realtime updates on the user's own profile row.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const recheck = () => loadProfile(uid);
    const onFocus = () => {
      if (document.visibilityState === "visible") recheck();
    };
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(recheck, 60_000);
    const channel = supabase
      .channel(`profile:${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        () => recheck(),
      )
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const setActiveRole = (r: AppRole) => {
    if (roles.includes(r)) setActiveRoleState(r);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        roles,
        isLeader: roles.includes("leader"),
        isMember: roles.includes("member"),
        activeRole,
        setActiveRole,
        ngnRate,
        fxRates,
        loading,
        refresh,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
