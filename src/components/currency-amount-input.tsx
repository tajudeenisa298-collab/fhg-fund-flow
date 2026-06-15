import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { fmtNgn, fmtUsd } from "@/lib/format";

export type Currency = "USD" | "NGN";

/**
 * Amount input with NGN/USD selector. Stores the canonical USD value via onUsdChange.
 * Pass valueUsd to control the underlying USD amount (e.g. when prefilling from a rank default).
 */
export function CurrencyAmountInput({
  id,
  valueUsd,
  onUsdChange,
  defaultCurrency = "NGN",
  min = 0.01,
  required = true,
  rate: rateProp,
  disabled,
}: {
  id?: string;
  valueUsd: number | string;
  onUsdChange: (usd: number) => void;
  defaultCurrency?: Currency;
  min?: number;
  required?: boolean;
  rate?: number;
  disabled?: boolean;
}) {
  const { ngnRate } = useAuth();
  const rate = rateProp ?? ngnRate ?? 1600;
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [raw, setRaw] = useState<string>("");
  const [lastUsd, setLastUsd] = useState<number>(Number(valueUsd) || 0);

  // Sync external valueUsd changes (e.g. defaults loaded async)
  useEffect(() => {
    const u = Number(valueUsd) || 0;
    if (u !== lastUsd) {
      setLastUsd(u);
      if (u === 0) {
        setRaw("");
      } else {
        setRaw(currency === "USD" ? String(u) : String(Math.round(u * rate)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueUsd]);

  const handleRaw = (v: string) => {
    setRaw(v);
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) {
      setLastUsd(0);
      onUsdChange(0);
      return;
    }
    const usd = currency === "USD" ? n : n / rate;
    setLastUsd(usd);
    onUsdChange(Number(usd.toFixed(4)));
  };

  const handleCurrency = (c: Currency) => {
    setCurrency(c);
    if (lastUsd > 0) {
      setRaw(c === "USD" ? String(Number(lastUsd.toFixed(2))) : String(Math.round(lastUsd * rate)));
    }
  };

  const preview = useMemo(() => {
    if (!lastUsd) return null;
    return currency === "USD"
      ? `≈ ${fmtNgn(lastUsd, rate)}`
      : `≈ ${fmtUsd(lastUsd)}`;
  }, [lastUsd, currency, rate]);

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={currency === "USD" ? "0.01" : "1"}
          min={currency === "USD" ? min : Math.max(1, Math.ceil(min * rate))}
          value={raw}
          onChange={(e) => handleRaw(e.target.value)}
          required={required}
          disabled={disabled}
          className="flex-1"
        />
        <Select value={currency} onValueChange={(v) => handleCurrency(v as Currency)} disabled={disabled}>
          <SelectTrigger className="w-[92px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NGN">NGN ₦</SelectItem>
            <SelectItem value="USD">USD $</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {preview && <p className="text-xs text-muted-foreground">{preview}</p>}
    </div>
  );
}
