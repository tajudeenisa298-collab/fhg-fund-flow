import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BankCombobox } from "@/components/bank-combobox";
import { resolveBankAccount } from "@/lib/paystack.functions";

export interface VerifiedBank {
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_owner_name: string;
}

/**
 * Bank entry with auto Paystack name verification. Calls `onVerified`
 * when the account is successfully resolved (or `onVerified(null)` when
 * the inputs change and verification is invalidated).
 */
export function BankVerifier({
  initial,
  onVerified,
}: {
  initial?: Partial<VerifiedBank> | null;
  onVerified: (v: VerifiedBank | null) => void;
}) {
  const [bankName, setBankName] = useState(initial?.bank_name ?? "");
  const [bankCode, setBankCode] = useState(initial?.bank_code ?? "");
  const [accNum, setAccNum] = useState(initial?.account_number ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    initial?.account_owner_name ? "ok" : "idle",
  );
  const [name, setName] = useState<string | null>(initial?.account_owner_name ?? null);
  const [err, setErr] = useState<string | null>(null);
  const resolve = useServerFn(resolveBankAccount);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    onVerified(null);
    setStatus("idle");
    setName(null);
    setErr(null);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!bankCode || !/^\d{10}$/.test(accNum)) return;

    setStatus("loading");
    debounceRef.current = window.setTimeout(async () => {
      const r = await resolve({ data: { account_number: accNum, bank_code: bankCode } });
      if (r.verified && r.account_name) {
        setStatus("ok");
        setName(r.account_name);
        onVerified({
          bank_name: bankName,
          bank_code: bankCode,
          account_number: accNum,
          account_owner_name: r.account_name,
        });
      } else {
        setStatus("error");
        setErr(r.error ?? "Could not verify account");
      }
    }, 700);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankCode, accNum]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="bv-bank">Bank</Label>
        <BankCombobox
          id="bv-bank"
          value={bankName}
          code={bankCode}
          onChange={({ name: n, code }) => {
            setBankName(n);
            setBankCode(code);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bv-acc">Account number</Label>
        <Input
          id="bv-acc"
          inputMode="numeric"
          maxLength={10}
          value={accNum}
          onChange={(e) => setAccNum(e.target.value.replace(/\D/g, ""))}
          placeholder="10 digits"
        />
      </div>
      <div className="min-h-9">
        {status === "loading" && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Verifying account…
          </p>
        )}
        {status === "ok" && name && (
          <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">
                Verified via Paystack — please confirm this is you.
              </p>
            </div>
          </div>
        )}
        {status === "error" && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="size-3.5" /> {err}
          </p>
        )}
      </div>
    </div>
  );
}
