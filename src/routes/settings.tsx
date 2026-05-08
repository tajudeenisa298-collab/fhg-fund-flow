import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BankCombobox } from "@/components/bank-combobox";
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

const bankSchema = z.object({
  bank_name: z.string().trim().min(2),
  account_number: z.string().trim().regex(/^\d{10}$/, "Account number must be 10 digits"),
  account_owner_name: z.string().trim().min(2).max(120),
});

function SettingsPage() {
  const { session, profile, loading } = useAuth();
  const nav = useNavigate();

  const [bank, setBank] = useState<BankAccount | null>(null);
  const [editing, setEditing] = useState(false);

  // Edit form
  const [bankName, setBankName] = useState("");
  const [accNum, setAccNum] = useState("");
  const [accOwner, setAccOwner] = useState("");

  // OTP state
  const [otpStage, setOtpStage] = useState<"idle" | "sent" | "saving">("idle");
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [loading, session, nav]);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        const b = (data as BankAccount) ?? null;
        setBank(b);
        if (b) {
          setBankName(b.bank_name);
          setAccNum(b.account_number);
          setAccOwner(b.account_owner_name);
        }
      });
  }, [session?.user]);

  const requestCode = async () => {
    if (!session?.user?.email) return;
    const parsed = bankSchema.safeParse({
      bank_name: bankName,
      account_number: accNum,
      account_owner_name: accOwner,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    const { error } = await supabase.auth.signInWithOtp({
      email: session.user.email,
      options: { shouldCreateUser: false },
    });
    if (error) return toast.error(error.message);
    setOtpStage("sent");
    toast.success("Verification code sent to your email");
  };

  const confirmAndSave = async () => {
    if (!session?.user?.email) return;
    if (!/^\d{6}$/.test(otp)) return toast.error("Enter the 6-digit code");
    setOtpStage("saving");
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: session.user.email,
      token: otp,
      type: "email",
    });
    if (vErr) {
      setOtpStage("sent");
      return toast.error(vErr.message);
    }
    const payload = {
      user_id: session.user.id,
      bank_name: bankName,
      account_number: accNum,
      account_owner_name: accOwner,
    };
    const { error: upErr } = await supabase
      .from("bank_accounts")
      .upsert(payload, { onConflict: "user_id" });
    if (upErr) {
      setOtpStage("idle");
      return toast.error(upErr.message);
    }
    toast.success("Bank details updated");
    setBank({
      ...payload,
      created_at: bank?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setEditing(false);
    setOtpStage("idle");
    setOtp("");
  };

  const startEdit = () => {
    setEditing(true);
    setOtpStage("idle");
    setOtp("");
  };

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft">
        <p className="text-muted-foreground">Loading…</p>
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
                Where your withdrawals get paid out.
              </p>
            </div>
            {!editing && (
              <Button onClick={startEdit}>{bank ? "Edit" : "Add details"}</Button>
            )}
          </div>

          {!editing && bank && (
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
            </dl>
          )}
          {!editing && !bank && (
            <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              No bank account on file. Add one so you can receive payouts.
            </p>
          )}

          {editing && (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bn">Bank</Label>
                <BankCombobox id="bn" value={bankName} onChange={setBankName} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="an">Account number</Label>
                <Input
                  id="an"
                  inputMode="numeric"
                  maxLength={10}
                  value={accNum}
                  onChange={(e) => setAccNum(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ao">Account holder</Label>
                <Input id="ao" value={accOwner} onChange={(e) => setAccOwner(e.target.value)} />
              </div>

              {otpStage === "idle" && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <ShieldCheck className="size-4 text-success" />
                  <span className="text-muted-foreground">
                    For security, we'll email a verification code before saving.
                  </span>
                </div>
              )}

              {otpStage !== "idle" && (
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification code</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code from {session.user.email}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sent to {session?.user?.email}.{" "}
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={requestCode}
                    >
                      Resend
                    </button>
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setOtpStage("idle");
                  }}
                >
                  Cancel
                </Button>
                {otpStage === "idle" ? (
                  <Button onClick={requestCode}>Send verification code</Button>
                ) : (
                  <Button onClick={confirmAndSave} disabled={otpStage === "saving"}>
                    {otpStage === "saving" ? "Saving…" : "Verify & save"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <h2 className="text-lg font-semibold">Account</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Name</dt>
              <dd className="mt-1 font-medium">{profile.full_name}</dd>
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

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/dashboard" className="text-primary hover:underline">
            ← Back to dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
