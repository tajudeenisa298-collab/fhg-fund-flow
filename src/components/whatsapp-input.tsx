import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Common country dial codes used by members. Keep short — NG is default.
export const DIAL_CODES = [
  { code: "+234", label: "🇳🇬 +234" },
  { code: "+233", label: "🇬🇭 +233" },
  { code: "+254", label: "🇰🇪 +254" },
  { code: "+256", label: "🇺🇬 +256" },
  { code: "+27",  label: "🇿🇦 +27" },
  { code: "+44",  label: "🇬🇧 +44" },
  { code: "+1",   label: "🇺🇸 +1" },
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+91",  label: "🇮🇳 +91" },
];

const DEFAULT_DIAL = "+234";

// Min/max NSN (national subscriber number) digit counts excluding country code.
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

function splitFull(full: string): { dial: string; nsn: string } {
  if (!full) return { dial: DEFAULT_DIAL, nsn: "" };
  const trimmed = full.trim().replace(/[^\d+]/g, "");
  if (trimmed.startsWith("+")) {
    const match = DIAL_CODES.find((d) => trimmed.startsWith(d.code));
    if (match) {
      return { dial: match.code, nsn: trimmed.slice(match.code.length).replace(/\D/g, "").replace(/^0+/, "") };
    }
  }
  return { dial: DEFAULT_DIAL, nsn: trimmed.replace(/\D/g, "").replace(/^0+/, "") };
}

export function validateWhatsappDigits(nsn: string): string | null {
  if (!nsn) return "Phone number is required";
  if (!/^\d+$/.test(nsn)) return "Use digits only — no spaces, dashes, or country code";
  if (nsn.length < MIN_DIGITS) return `Number must be at least ${MIN_DIGITS} digits`;
  if (nsn.length > MAX_DIGITS) return `Number must be at most ${MAX_DIGITS} digits`;
  return null;
}

export type WhatsappInputProps = {
  value: string;                         // full E.164-ish value e.g. "+2348012345678"
  onChange: (full: string) => void;      // emits "+<dial><nsn>" or "" if nsn empty
  id?: string;
  disabled?: boolean;
  className?: string;
  showError?: boolean;                   // render inline error message
};

export function WhatsappInput({ value, onChange, id, disabled, className, showError = true }: WhatsappInputProps) {
  const initial = useMemo(() => splitFull(value), [value]);
  const [dial, setDial] = useState(initial.dial);
  const [nsn, setNsn] = useState(initial.nsn);

  // Sync if parent changes value externally.
  useEffect(() => {
    const next = splitFull(value);
    setDial(next.dial);
    setNsn(next.nsn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const error = nsn ? validateWhatsappDigits(nsn) : null;

  function emit(nextDial: string, nextNsn: string) {
    onChange(nextNsn ? `${nextDial}${nextNsn}` : "");
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Select
          value={dial}
          onValueChange={(v) => { setDial(v); emit(v, nsn); }}
          disabled={disabled}
        >
          <SelectTrigger className="w-[110px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DIAL_CODES.map((d) => (
              <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="8012345678"
          value={nsn}
          disabled={disabled}
          onChange={(e) => {
            // Strip non-digits and any leading zero (national trunk prefix).
            const cleaned = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
            setNsn(cleaned);
            emit(dial, cleaned);
          }}
          maxLength={MAX_DIGITS}
          aria-invalid={!!error}
        />
      </div>
      {showError && error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
      {!error && (
        <p className="mt-1 text-xs text-muted-foreground">
          Don&apos;t include the country code or leading 0 — pick the country and type the rest.
        </p>
      )}
    </div>
  );
}
