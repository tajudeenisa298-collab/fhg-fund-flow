import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/auth-context";

const STORAGE_KEY = "fhg.onboarding.dismissed";

type Step = {
  id: string;
  label: string;
  done: boolean;
  cta?: { label: string; href: string };
};

/**
 * Onboarding checklist for brand-new members. Hides itself once every step
 * is done or the user explicitly dismisses it (stored locally — leaders can
 * always tell who's finished by checking the profile completeness card).
 */
export function OnboardingChecklist({ profile }: { profile: Profile }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [hasBank, setHasBank] = useState<boolean | null>(null);
  const [readRules, setReadRules] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("fhg.onboarding.rules") === "1";
  });

  useEffect(() => {
    supabase
      .from("bank_accounts")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setHasBank(!!data));
  }, [profile.id]);

  const isNew = (Date.now() - new Date(profile.created_at).getTime()) / 86400_000 < 14;
  if (dismissed || !isNew) return null;

  const steps: Step[] = [
    {
      id: "name",
      label: "Add your full name",
      done: !!profile.full_name && profile.full_name.trim().length > 1,
      cta: { label: "Edit profile", href: "/settings" },
    },
    {
      id: "whatsapp",
      label: "Add your WhatsApp number so your leader can reach you",
      done: !!profile.whatsapp_number,
      cta: { label: "Add WhatsApp", href: "/settings" },
    },
    {
      id: "bank",
      label: "Add a bank account for withdrawals",
      done: hasBank === true,
      cta: { label: "Add bank", href: "/settings" },
    },
    {
      id: "avatar",
      label: "Upload a profile photo (optional but recommended)",
      done: !!profile.avatar_url,
      cta: { label: "Upload photo", href: "/settings" },
    },
    {
      id: "rules",
      label: "Read your team's fund rules and announcements",
      done: readRules,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);
  if (completed === steps.length) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Welcome — let's get you set up</h2>
          <p className="text-sm text-muted-foreground">
            {completed} of {steps.length} done · {pct}% complete
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss onboarding"
          onClick={() => {
            setDismissed(true);
            window.localStorage.setItem(STORAGE_KEY, "1");
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              {s.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
            </span>
            {!s.done && s.id === "rules" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReadRules(true);
                  window.localStorage.setItem("fhg.onboarding.rules", "1");
                }}
              >
                Mark read
              </Button>
            )}
            {!s.done && s.cta && (
              <Button size="sm" variant="outline" asChild>
                <Link to={s.cta.href}>{s.cta.label}</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
