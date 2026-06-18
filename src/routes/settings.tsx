import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BankVerifier, type VerifiedBank } from "@/components/bank-verifier";
import { AvatarUpload } from "@/components/avatar-upload";
import { SecuritySection } from "@/components/settings/security-section";
import { SUPPORTED_LOCALES } from "@/lib/format";
import type { BankAccount } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — FHG Funds" },
      { name: "description", content: "Manage your bank details and account preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { session, profile, loading, refresh } = useAuth();
  const nav = useNavigate();

  const [bank, setBank] = useState<BankAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [verified, setVerified] = useState<VerifiedBank | null>(null);
  const [saving, setSaving] = useState(false);

  // 6-digit email OTP gate before any bank change
  const [otpStage, setOtpStage] = useState<"idle" | "sending" | "awaiting" | "verifying">("idle");
  const [otpCode, setOtpCode] = useState("");

  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [whatsapp, setWhatsapp] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"bank_transfer" | "neolife_pv">("bank_transfer");
  const [locale, setLocale] = useState<string>("en-US");
  const [gender, setGender] = useState<"" | "male" | "female" | "other" | "prefer_not_to_say">("");
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [loading, session, nav]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setWhatsapp(profile.whatsapp_number ?? "");
      setPayoutMethod(profile.payout_method ?? "bank_transfer");
      setLocale(profile.locale ?? "en-US");
      setGender(profile.gender ?? "");
    }
  }, [profile]);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setBank((data as BankAccount) ?? null));
  }, [session?.user]);

  const writeBank = async () => {
    if (!session?.user || !verified) return;
    setSaving(true);
    const payload = {
      user_id: session.user.id,
      bank_name: verified.bank_name,
      bank_code: verified.bank_code,
      account_number: verified.account_number,
      account_owner_name: verified.account_owner_name,
      verified_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase
      .from("bank_accounts")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (upErr) return toast.error(upErr.message);
    toast.success("Bank details updated");
    setBank({
      ...payload,
      created_at: bank?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setEditing(false);
    setVerified(null);
    setOtpStage("idle");
    setOtpCode("");
  };

  const requestOtp = async () => {
    if (!verified) return toast.error("Verify the account first");
    setOtpStage("sending");
    const { error } = await supabase.auth.reauthenticate();
    if (error) {
      setOtpStage("idle");
      return toast.error(error.message);
    }
    setOtpStage("awaiting");
    toast.success("We sent a 6-digit code to your email");
  };

  const verifyOtpAndSave = async () => {
    if (!session?.user) return;
    const token = otpCode.trim();
    if (!/^\d{6}$/.test(token)) return toast.error("Enter the 6-digit code");
    setOtpStage("verifying");
    const { error } = await supabase.auth.verifyOtp({
      email: session.user.email!,
      token,
      type: "reauthentication",
    });
    if (error) {
      setOtpStage("awaiting");
      return toast.error(error.message);
    }
    await writeBank();
  };

  const saveName = async () => {
    if (!session?.user) return;
    const trimmed = fullName.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      return toast.error("Name must be 2–100 characters");
    }
    setSavingName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: trimmed })
      .eq("id", session.user.id);
    setSavingName(false);
    if (error) return toast.error(error.message);
    toast.success("Name updated");
    setEditingName(false);
    await refresh();
  };

  const savePrefs = async () => {
    if (!session?.user) return;
    const trimmed = whatsapp.trim();
    if (trimmed && !/^\+?[0-9]{7,15}$/.test(trimmed)) {
      return toast.error("WhatsApp must be 7–15 digits, optional leading +");
    }
    setSavingPrefs(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        whatsapp_number: trimmed || null,
        payout_method: payoutMethod,
        locale,
        gender: gender || null,
      })
      .eq("id", session.user.id);
    setSavingPrefs(false);
    if (error) return toast.error(error.message);
    toast.success("Preferences saved");
    await refresh();
  };


  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gradient-soft p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-6">
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/dashboard" })}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Bank account</h2>
              <p className="text-sm text-muted-foreground">
                We verify the account name automatically with Paystack before saving.
              </p>
            </div>
            {!editing && (
              <Button onClick={() => setEditing(true)}>{bank ? "Edit" : "Add details"}</Button>
            )}
          </div>

          {!editing && bank && (
            <>
              {(() => {
                const stale =
                  !bank.verified_at ||
                  (Date.now() - new Date(bank.verified_at).getTime()) / 86400000 > 180;
                if (!stale) return null;
                return (
                  <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                    <strong className="font-semibold">
                      {bank.verified_at ? "Bank details haven't been re-verified in over 6 months." : "Bank account hasn't been verified."}
                    </strong>{" "}
                    Click Edit and re-confirm to keep payouts moving.
                  </div>
                );
              })()}
              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bank</dt>
                  <dd className="mt-1 font-medium">{bank.bank_name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Account #</dt>
                  <dd className="mt-1 font-mono">{bank.account_number}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Holder</dt>
                  <dd className="mt-1 font-medium">{bank.account_owner_name}</dd>
                </div>
                {bank.verified_at && (
                  <p className="sm:col-span-3 text-xs text-success">
                    ✓ Verified via Paystack · {new Date(bank.verified_at).toLocaleDateString()}
                  </p>
                )}
              </dl>
            </>
          )}
          {!editing && !bank && (
            <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              No bank account on file. Add one so you can receive payouts.
            </p>
          )}

          {editing && (
            <div className="mt-6 space-y-4">
              <BankVerifier
                initial={
                  bank
                    ? {
                        bank_name: bank.bank_name,
                        bank_code: bank.bank_code ?? "",
                        account_number: bank.account_number,
                        account_owner_name: bank.account_owner_name,
                      }
                    : null
                }
                onVerified={setVerified}
              />

              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <ShieldCheck className="size-4 text-success" />
                <span className="text-muted-foreground">
                  For your security, we'll email a 6-digit code to confirm any bank change.
                </span>
              </div>

              {otpStage === "awaiting" || otpStage === "verifying" ? (
                <div className="space-y-2 rounded-lg border bg-card p-4">
                  <label className="text-sm font-medium" htmlFor="bank-otp">
                    Enter the 6-digit code sent to {session?.user?.email}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="bank-otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="max-w-[140px] tracking-[0.5em] text-center font-mono text-lg"
                    />
                    <Button
                      onClick={verifyOtpAndSave}
                      disabled={otpStage === "verifying" || saving || otpCode.length !== 6}
                    >
                      {otpStage === "verifying" || saving ? "Verifying…" : "Confirm & save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={requestOtp}
                      disabled={otpStage === "verifying"}
                    >
                      Resend code
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setVerified(null);
                    setOtpStage("idle");
                    setOtpCode("");
                  }}
                >
                  Cancel
                </Button>
                {otpStage === "idle" || otpStage === "sending" ? (
                  <Button onClick={requestOtp} disabled={!verified || otpStage === "sending"}>
                    {otpStage === "sending"
                      ? "Sending code…"
                      : verified
                        ? "Send verification code"
                        : "Verify account first"}
                  </Button>
                ) : null}
              </div>

            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">Account</h2>
            {!editingName && (
              <Button variant="outline" size="sm" onClick={() => setEditingName(true)}>
                Edit name
              </Button>
            )}
          </div>
          <div className="mt-6">
            <AvatarUpload />
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Name</dt>
              {editingName ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={100}
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={saveName} disabled={savingName}>
                    {savingName ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFullName(profile.full_name);
                      setEditingName(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <dd className="mt-1 font-medium">{profile.full_name}</dd>
              )}
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd className="mt-1 font-medium">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Rank</dt>
              <dd className="mt-1 font-medium">{profile.rank}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Contact & payouts</h2>
              <p className="text-sm text-muted-foreground">
                How we reach you and how you'd like to receive your share.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground" htmlFor="whatsapp">
                WhatsApp number
              </label>
              <Input
                id="whatsapp"
                inputMode="tel"
                placeholder="+2348012345678"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="mt-1"
                maxLength={20}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground" htmlFor="payout">
                Preferred payout method
              </label>
              <select
                id="payout"
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value as "bank_transfer" | "neolife_pv")}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="bank_transfer">Bank transfer (NGN)</option>
                <option value="neolife_pv">NeoLife PV credit</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground" htmlFor="locale">
                Language & region
              </label>
              <select
                id="locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Controls how numbers, currencies, and dates are formatted across the app.
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={savePrefs}
              disabled={
                savingPrefs ||
                (whatsapp.trim() === (profile.whatsapp_number ?? "") &&
                  payoutMethod === (profile.payout_method ?? "bank_transfer") &&
                  locale === (profile.locale ?? "en-US"))
              }
            >
              {savingPrefs ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        </section>




        <SecuritySection />

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/dashboard" className="text-primary hover:underline">
            ← Back to dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
