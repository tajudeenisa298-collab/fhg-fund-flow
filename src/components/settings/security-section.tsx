import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Smartphone, KeyRound, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Device {
  id: string;
  device_hash: string;
  user_agent: string | null;
  label: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface Factor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

export function SecuritySection() {
  const { session, isLeader } = useAuth();
  const email = session?.user.email ?? "";

  // password
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // email change
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // MFA
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollState, setEnrollState] =
    useState<null | { factorId: string; qr: string; secret: string }>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [unenrollTarget, setUnenrollTarget] = useState<string | null>(null);

  // devices
  const [devices, setDevices] = useState<Device[]>([]);

  const loadFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return;
    const all = [...(data.totp ?? [])] as Factor[];
    setFactors(all);
  };

  const loadDevices = async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from("login_devices")
      .select("*")
      .eq("user_id", session.user.id)
      .order("last_seen_at", { ascending: false });
    setDevices((data as Device[]) ?? []);
  };

  useEffect(() => {
    loadFactors();
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const changePassword = async () => {
    if (pw.length < 8) return toast.error("Use at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSavingPw(false);
    if (error) return toast.error(error.message);
    setPw("");
    setPw2("");
    toast.success("Password updated");
  };

  const changeEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
      return toast.error("Enter a valid email");
    if (trimmed === email.toLowerCase()) return toast.error("That's your current email");
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setSavingEmail(false);
    if (error) return toast.error(error.message);
    setNewEmail("");
    toast.success("Confirmation sent to both your current and new email addresses");
  };

  const startEnroll = async () => {
    setMfaBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setMfaBusy(false);
    if (error) return toast.error(error.message);
    setEnrollState({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const verifyEnroll = async () => {
    if (!enrollState) return;
    if (!/^\d{6}$/.test(mfaCode)) return toast.error("Enter the 6-digit code");
    setMfaBusy(true);
    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId: enrollState.factorId,
    });
    if (chalErr) {
      setMfaBusy(false);
      return toast.error(chalErr.message);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrollState.factorId,
      challengeId: chal.id,
      code: mfaCode,
    });
    setMfaBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Two-factor authentication enabled");
    setEnrollState(null);
    setMfaCode("");
    await loadFactors();
  };

  const cancelEnroll = async () => {
    if (enrollState) {
      await supabase.auth.mfa.unenroll({ factorId: enrollState.factorId });
    }
    setEnrollState(null);
    setMfaCode("");
    await loadFactors();
  };

  const confirmUnenroll = async () => {
    if (!unenrollTarget) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: unenrollTarget });
    setUnenrollTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Two-factor removed");
    await loadFactors();
  };

  const revokeDevice = async (id: string) => {
    const { error } = await supabase.from("login_devices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Device removed from your list");
    await loadDevices();
  };

  const verifiedFactors = factors.filter((f) => f.status === "verified");
  const mfaEnabled = verifiedFactors.length > 0;

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-start gap-3">
        <ShieldCheck className="size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="text-sm text-muted-foreground">
            Password, email, two-factor authentication, and the devices that have
            signed in to your account.
          </p>
        </div>
      </div>

      {/* Password */}
      <div className="mt-6 border-t pt-6">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4" />
          <h3 className="font-medium">Change password</h3>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            type="password"
            placeholder="New password (min 8)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={changePassword} disabled={savingPw || !pw || !pw2}>
            {savingPw ? "Saving…" : "Update password"}
          </Button>
        </div>
      </div>

      {/* Email */}
      <div className="mt-6 border-t pt-6">
        <div className="flex items-center gap-2">
          <Mail className="size-4" />
          <h3 className="font-medium">Change email</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Current: <span className="font-medium">{email}</span>. You'll need to
          confirm the change from both inboxes.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            type="email"
            placeholder="new@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={changeEmail} disabled={savingEmail || !newEmail}>
            {savingEmail ? "Sending…" : "Send confirmation"}
          </Button>
        </div>
      </div>

      {/* MFA */}
      <div className="mt-6 border-t pt-6">
        <div className="flex items-center gap-2">
          <Smartphone className="size-4" />
          <h3 className="font-medium">Two-factor authentication (TOTP)</h3>
          {mfaEnabled && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              Enabled
            </span>
          )}
        </div>
        {isLeader && !mfaEnabled && (
          <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            You handle funds. Enabling two-factor authentication is strongly
            recommended for leader accounts.
          </div>
        )}

        {!enrollState && !mfaEnabled && (
          <div className="mt-3">
            <Button onClick={startEnroll} disabled={mfaBusy} variant="outline">
              Set up authenticator app
            </Button>
          </div>
        )}

        {enrollState && (
          <div className="mt-4 space-y-3 rounded-xl border bg-muted/30 p-4">
            <p className="text-sm">
              Scan this QR with Google Authenticator, 1Password, Authy, or any
              TOTP app. Then enter the 6-digit code to confirm.
            </p>
            <div className="flex flex-wrap items-start gap-4">
              <img
                src={enrollState.qr}
                alt="TOTP QR code"
                className="size-40 rounded-md border bg-white p-2"
              />
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Or enter this secret manually
                </p>
                <code className="block break-all rounded bg-background px-2 py-1 font-mono text-xs">
                  {enrollState.secret}
                </code>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                className="max-w-[140px] tracking-[0.4em] text-center font-mono"
              />
              <Button onClick={verifyEnroll} disabled={mfaBusy || mfaCode.length !== 6}>
                {mfaBusy ? "Verifying…" : "Confirm & enable"}
              </Button>
              <Button variant="ghost" onClick={cancelEnroll} disabled={mfaBusy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mfaEnabled && (
          <ul className="mt-3 space-y-2">
            {verifiedFactors.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <span>{f.friendly_name ?? "Authenticator"}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setUnenrollTarget(f.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Devices */}
      <div className="mt-6 border-t pt-6">
        <h3 className="font-medium">Recent sign-in devices</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We log each browser/device that signs in to your account. Removing a
          device clears it from this list — to actually sign it out, change your
          password.
        </p>
        {devices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No devices recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{d.label ?? "Unknown device"}</div>
                  <div className="text-xs text-muted-foreground">
                    Last seen {new Date(d.last_seen_at).toLocaleString()} ·
                    first seen {new Date(d.first_seen_at).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revokeDevice(d.id)}
                  title="Remove from list"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={!!unenrollTarget}
        onOpenChange={(o) => !o && setUnenrollTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will no longer require a one-time code at sign-in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep enabled</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnenroll}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
