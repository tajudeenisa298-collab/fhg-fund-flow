import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const ngn = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function formatNgnAmount(amount: number) {
  return ngn(amount);
}

/** NGN-first money display: large NGN, small USD subtitle. */
export function Money({
  usd: usdAmount,
  rate,
  className,
  size = "md",
  inline = false,
}: {
  usd: number | string;
  rate?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
}) {
  const { ngnRate, ngnRateReady } = useAuth();
  // Only show NGN when we have an explicit rate prop or a server-loaded rate.
  // Avoids the wrong-value flash from a hardcoded fallback before app_settings load.
  const r = rate ?? (ngnRateReady ? ngnRate : null);
  const u = Number(usdAmount) || 0;
  const sizes = {
    sm: { primary: "text-sm", secondary: "text-[10px]" },
    md: { primary: "text-base font-semibold", secondary: "text-xs" },
    lg: { primary: "text-2xl font-bold tracking-tight", secondary: "text-sm" },
  }[size];

  if (r === null) {
    // Rate not yet available — show USD only as a single primary line.
    if (inline) {
      return (
        <span className={cn("whitespace-nowrap font-mono", sizes.primary, className)}>
          {usd(u)}
        </span>
      );
    }
    return (
      <div className={cn("flex flex-col leading-tight", className)}>
        <span className={cn("font-mono", sizes.primary)}>{usd(u)}</span>
      </div>
    );
  }

  const n = u * r;
  if (inline) {
    return (
      <span className={cn("whitespace-nowrap", className)}>
        <span className={cn("font-mono", sizes.primary)}>{ngn(n)}</span>{" "}
        <span className={cn("text-muted-foreground", sizes.secondary)}>≈ {usd(u)}</span>
      </span>
    );
  }
  return (
    <div className={cn("flex flex-col leading-tight", className)}>
      <span className={cn("font-mono", sizes.primary)}>{ngn(n)}</span>
      <span className={cn("text-muted-foreground", sizes.secondary)}>≈ {usd(u)}</span>
    </div>
  );
}

/** Inline NGN preview helper for inputs (e.g., "≈ ₦160,000"). */
export function NgnPreview({ usd: amt, rate }: { usd: number; rate?: number }) {
  const { ngnRate, ngnRateReady } = useAuth();
  const r = rate ?? (ngnRateReady ? ngnRate : null);
  if (!amt || amt <= 0 || r === null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      ≈ <span className="font-mono">{ngn(amt * r)}</span>
    </p>
  );
}

export function HistoricalMoney({
  usd: usdAmount,
  localNgn,
  className,
  size = "md",
  inline = false,
}: {
  usd: number | string;
  localNgn: number | null | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
}) {
  if (localNgn === null || localNgn === undefined || !Number.isFinite(Number(localNgn))) {
    return <Money usd={usdAmount} className={className} size={size} inline={inline} />;
  }

  const u = Number(usdAmount) || 0;
  const n = Number(localNgn) || 0;
  const sizes = {
    sm: { primary: "text-sm", secondary: "text-[10px]" },
    md: { primary: "text-base font-semibold", secondary: "text-xs" },
    lg: { primary: "text-2xl font-bold tracking-tight", secondary: "text-sm" },
  }[size];

  if (inline) {
    return (
      <span className={cn("whitespace-nowrap", className)}>
        <span className={cn("font-mono", sizes.primary)}>{ngn(n)}</span>{" "}
        <span className={cn("text-muted-foreground", sizes.secondary)}>locked · {usd(u)}</span>
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col leading-tight", className)}>
      <span className={cn("font-mono", sizes.primary)}>{ngn(n)}</span>
      <span className={cn("text-muted-foreground", sizes.secondary)}>locked · {usd(u)}</span>
    </div>
  );
}
