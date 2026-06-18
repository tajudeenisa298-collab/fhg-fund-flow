import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/auth-context";

interface Item {
  key: string;
  label: string;
  done: boolean;
  to?: string;
  hash?: string;
}

export function ProfileCompleteness({ profile }: { profile: Profile }) {
  const [hasBank, setHasBank] = useState<boolean | null>(null);

  useEffect(() => {
    supabase
      .from("bank_accounts")
      .select("user_id, verified_at")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setHasBank(!!data?.verified_at));
  }, [profile.id]);

  const items: Item[] = [
    { key: "name", label: "Add your full name", done: !!profile.full_name && profile.full_name.trim().length > 1, to: "/settings" },
    { key: "avatar", label: "Upload a profile photo", done: !!profile.avatar_url, to: "/settings" },
    { key: "gender", label: "Tell us your gender", done: !!profile.gender, to: "/settings" },
    { key: "whatsapp", label: "Add WhatsApp number", done: !!profile.whatsapp_number, to: "/settings" },
    { key: "bank", label: "Verify your bank account", done: !!hasBank, to: "/settings" },
  ];

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);
  const verified = done === total;

  if (verified) {
    return (
      <section className="rounded-2xl border border-success/30 bg-success/5 p-4 shadow-card">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-success" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Verified profile</p>
            <p className="text-xs text-muted-foreground">
              Your account is fully set up. You're trusted for faster payouts.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">Complete your profile</h2>
          <p className="text-xs text-muted-foreground">
            Finish setup to unlock the verified badge and faster payouts.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {pct}%
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.key}>
            {i.to && !i.done ? (
              <Link
                to={i.to}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <Circle className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{i.label}</span>
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                {i.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={`truncate ${i.done ? "text-muted-foreground line-through" : ""}`}>
                  {i.label}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
