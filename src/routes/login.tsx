import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { deviceHash, deviceLabel } from "@/lib/device-fingerprint";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in - FHG Funds" },
      { name: "description", content: "Sign in to your FHG Funds account." },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
});

function LoginPage() {
  const nav = useNavigate();
  const {
    session,
    loading: authLoading,
    refresh,
    fundHandlerMfaRequired,
    fundHandlerMfaSetupRequired,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"password" | "verify" | "setup">("password");
  const [mfaCode, setMfaCode] = useState("");
  const [challenge, setChallenge] = useState<null | { factorId: string; challengeId: string }>(null);
  const [enrollState, setEnrollState] =
    useState<null | { factorId: string; qr: string; secret: string }>(null);

  useEffect(() => {
    if (authLoading || !session) return;
    if (fundHandlerMfaRequired) {
      setStage("verify");
      if (!challenge && !loading) void startMfaChallenge();
      return;
    }
    if (fundHandlerMfaSetupRequired) {
      setStage("setup");
      return;
    }
    nav({ to: "/dashboard" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session, fundHandlerMfaRequired, fundHandlerMfaSetupRequired, nav]);

  const recordDeviceAndEnter = async () => {
    try {
      const hash = await deviceHash();
      await supabase.rpc("record_login_device", {
        _hash: hash,
        _ua: navigator.userAgent,
        _label: deviceLabel(),
      });
    } catch {
      // non-fatal
    }
    await refresh();
    toast.success("Welcome back!");
    nav({ to: "/dashboard" });
  };

  const startMfaChallenge = async () => {
    setLoading(true);
    const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
    if (factorsErr) {
      setLoading(false);
      return toast.error(factorsErr.message);
    }
    const factor = factors.totp.find((f) => f.status === "verified");
    if (!factor) {
      setLoading(false);
      setStage("setup");
      return;
    }
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    setLoading(false);
    if (error) return toast.error(error.message);
    setChallenge({ factorId: factor.id, challengeId: data.id });
    setStage("verify");
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return startMfaChallenge();
    if (!/^\d{6}$/.test(mfaCode)) return toast.error("Enter the 6-digit code");
    setLoading(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: challenge.factorId,
      challengeId: challenge.challengeId,
      code: mfaCode,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setMfaCode("");
    setChallenge(null);
    await recordDeviceAndEnter();
  };

  const startEnroll = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setEnrollState({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const verifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollState) return;
    if (!/^\d{6}$/.test(mfaCode)) return toast.error("Enter the 6-digit code");
    setLoading(true);
    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId: enrollState.factorId,
    });
    if (chalErr) {
      setLoading(false);
      return toast.error(chalErr.message);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrollState.factorId,
      challengeId: chal.id,
      code: mfaCode,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setMfaCode("");
    setEnrollState(null);
    await recordDeviceAndEnter();
  };

  const requiresFundHandlerSecurity = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return false;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("can_handle_funds").eq("id", user.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.user.id),
    ]);
    const roleList = ((roles as { role: string }[]) ?? []).map((r) => r.role);
    return !!profile?.can_handle_funds || roleList.includes("leader");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    const needsFundHandlerSecurity = await requiresFundHandlerSecurity();
    if (needsFundHandlerSecurity) {
      const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) {
        setLoading(false);
        return toast.error(factorsErr.message);
      }
      const factor = factors.totp.find((f) => f.status === "verified");
      if (factor) {
        const { data, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
        setLoading(false);
        if (challengeErr) return toast.error(challengeErr.message);
        setChallenge({ factorId: factor.id, challengeId: data.id });
        setStage("verify");
        toast.message("Enter your authenticator code to continue");
        return;
      }
      setLoading(false);
      setStage("setup");
      toast.message("Set up two-factor authentication to continue");
      return;
    }

    setLoading(false);
    await recordDeviceAndEnter();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elegant">
            <Wallet className="size-5 text-primary-foreground" />
          </div>
          <span className="font-semibold">FHG Funds</span>
        </Link>
        <div className="rounded-2xl border bg-card p-8 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight">
            {stage === "password" ? "Welcome back" : "Protect fund access"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stage === "password"
              ? "Sign in to continue."
              : "Fund-handling accounts need an authenticator code after password sign-in."}
          </p>

          {stage === "password" && (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          )}

          {stage === "verify" && (
            <form onSubmit={verifyMfa} className="mt-6 space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="size-4 text-primary" />
                  Authenticator required
                </div>
                <p className="mt-1 text-muted-foreground">
                  Open your authenticator app and enter the 6-digit code.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Authenticator code</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="tracking-[0.5em] text-center font-mono text-lg"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || mfaCode.length !== 6}>
                {loading ? "Verifying..." : "Verify & continue"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={startMfaChallenge} disabled={loading}>
                Send a fresh challenge
              </Button>
            </form>
          )}

          {stage === "setup" && (
            <form onSubmit={verifyEnroll} className="mt-6 space-y-4">
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="size-4 text-warning" />
                  Setup required for fund handlers
                </div>
                <p className="mt-1 text-muted-foreground">
                  Set up Google Authenticator, Authy, 1Password, or any TOTP app before opening fund tools.
                </p>
              </div>
              {!enrollState ? (
                <Button type="button" className="w-full" onClick={startEnroll} disabled={loading}>
                  {loading ? "Preparing..." : "Set up authenticator app"}
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start gap-4 rounded-xl border bg-muted/30 p-4">
                    <img
                      src={enrollState.qr}
                      alt="Authenticator QR code"
                      className="size-40 rounded-md border bg-white p-2"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Manual secret</p>
                      <code className="mt-1 block break-all rounded bg-background px-2 py-1 font-mono text-xs">
                        {enrollState.secret}
                      </code>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setup-code">6-digit code</Label>
                    <Input
                      id="setup-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="tracking-[0.5em] text-center font-mono text-lg"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || mfaCode.length !== 6}>
                    {loading ? "Enabling..." : "Enable & continue"}
                  </Button>
                </div>
              )}
            </form>
          )}

          {stage === "password" && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Create an account
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
