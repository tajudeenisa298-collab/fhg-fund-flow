import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BankVerifier, type VerifiedBank } from "@/components/bank-verifier";
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
  const { session, profile, loading } = useAuth();
  const nav = useNavigate();

  const [bank, setBank] = useState<BankAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [verified, setVerified] = useState<VerifiedBank | null>(null);
  const [saving, setSaving] = useState(false);

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
      .then(({ data }) => setBank((data as BankAccount) ?? null));
  }, [session?.user]);

  const save = async () => {
    if (!session?.user || !verified) return toast.error("Verify the account first");
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
                We verify the account name automatically with Paystack before saving.
              </p>
            </div>
            {!editing && (
              <Button onClick={() => setEditing(true)}>{bank ? "Edit" : "Add details"}</Button>
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
              {bank.verified_at && (
                <p className="sm:col-span-3 text-xs text-success">✓ Verified via Paystack</p>
              )}
            </dl>
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
                  Account name is verified live with Paystack — no email code needed.
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setVerified(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={save} disabled={!verified || saving}>
                  {saving ? "Saving…" : verified ? "Save bank details" : "Verify account first"}
                </Button>
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
