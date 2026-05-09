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
  const { ngnRate } = useAuth();
  const r = rate ?? ngnRate ?? 1600;
  const u = Number(usdAmount) || 0;
  const n = u * r;
  const sizes = {
    sm: { primary: "text-sm", secondary: "text-[10px]" },
    md: { primary: "text-base font-semibold", secondary: "text-xs" },
    lg: { primary: "text-2xl font-bold tracking-tight", secondary: "text-sm" },
  }[size];

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
  const { ngnRate } = useAuth();
  const r = rate ?? ngnRate ?? 1600;
  if (!amt || amt <= 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      ≈ <span className="font-mono">{ngn(amt * r)}</span>
    </p>
  );
}
