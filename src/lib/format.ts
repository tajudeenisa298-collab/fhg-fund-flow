export const fmtUsd = (n: number | string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);

export const fmtNgn = (usd: number | string, rate: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(
    (Number(usd) || 0) * (Number(rate) || 0),
  );

/** USD with NGN in muted parens, e.g. "$50.00 (₦80,000)" */
export const fmtUsdNgn = (usd: number | string, rate: number) =>
  `${fmtUsd(usd)} (${fmtNgn(usd, rate)})`;

export const fmtDate = (s: string) =>
  new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const fmtMoney = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(n) || 0);
  } catch {
    return `${currency} ${Number(n).toLocaleString()}`;
  }
};
