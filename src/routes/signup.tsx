import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wallet, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BankVerifier, type VerifiedBank } from "@/components/bank-verifier";
import { GENDER_LABEL, type Gender } from "@/lib/types";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — FHG Funds" },
      { name: "description", content: "Create your FHG Funds account and start growing your team." },
    ],
  }),
  component: SignupPage,
});

const baseSchema = z.object({
  full_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
});

function SignupPage() {
  const nav = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [inviteCode, setInviteCode] = useState("");
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifiedBank, setVerifiedBank] = useState<VerifiedBank | null>(null);

  useEffect(() => {
    if (!authLoading && session) nav({ to: "/dashboard" });
  }, [authLoading, session, nav]);

  useEffect(() => {
    const code = inviteCode.trim();
    if (!code) {
      setSponsorName(null);
      return;
    }
    setValidating(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("validate_invite_code", { _code: code });
      setValidating(false);
      if (error || !data || data.length === 0) setSponsorName(null);
      else setSponsorName(data[0].leader_name);
    }, 350);
    return () => clearTimeout(t);
  }, [inviteCode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gender) return toast.error("Please select your gender");
    const parsed = baseSchema.safeParse({ full_name, email, password, gender });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (inviteCode.trim() && !sponsorName)
      return toast.error("Invite code is invalid or expired");

    setLoading(true);
    const { data: authData, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: parsed.data.full_name,
          invite_code: inviteCode.trim(),
          gender: parsed.data.gender,
        },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    if (verifiedBank && authData.user) {
      const { error: bankErr } = await supabase.from("bank_accounts").insert({
        user_id: authData.user.id,
        bank_name: verifiedBank.bank_name,
        bank_code: verifiedBank.bank_code,
        account_number: verifiedBank.account_number,
        account_owner_name: verifiedBank.account_owner_name,
        verified_at: new Date().toISOString(),
      });
      if (bankErr) toast.error(`Bank details: ${bankErr.message}`);
    }
    setLoading(false);
    toast.success("Account created!");
    nav({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elegant">
            <Wallet className="size-5 text-primary-foreground" />
          </div>
          <span className="font-semibold">FHG Funds</span>
        </Link>
        <div className="rounded-2xl border bg-card p-8 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a sponsor's invite code to join their team — or skip it to start your own.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" value={full_name} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </div>

            <div className="space-y-2">
              <Label>Gender</Label>
              <RadioGroup
                value={gender}
                onValueChange={(v) => setGender(v as Gender)}
                className="grid grid-cols-2 gap-2"
              >
                {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                  <label
                    key={g}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm"
                  >
                    <RadioGroupItem value={g} />
                    <span>{GENDER_LABEL[g]}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite">Invite code (optional)</Label>
              <Input
                id="invite"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. FHG-AB12CD"
              />
              {validating && <p className="text-xs text-muted-foreground">Checking code…</p>}
              {!validating && sponsorName && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="size-3.5" /> Sponsored by {sponsorName}
                </p>
              )}
              {!validating && inviteCode && !sponsorName && (
                <p className="text-xs text-destructive">Invalid, used or expired code</p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Bank details (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Verified automatically — needed for withdrawals. You can also add them later.
                </p>
              </div>
              <BankVerifier onVerified={setVerifiedBank} />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have one?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
