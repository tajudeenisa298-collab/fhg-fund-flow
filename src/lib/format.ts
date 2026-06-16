/**
 * All formatters accept an optional `locale` (e.g. profile.locale).
 * When omitted, they fall back to a sensible default per type.
 */

export const fmtUsd = (n: number | string, locale: string = "en-US") =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(Number(n) || 0);

export const fmtNgn = (usd: number | string, rate: number, locale: string = "en-NG") =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(
    (Number(usd) || 0) * (Number(rate) || 0),
  );

/** USD with NGN in muted parens, e.g. "$50.00 (₦80,000)" */
export const fmtUsdNgn = (usd: number | string, rate: number, locale?: string) =>
  `${fmtUsd(usd, locale)} (${fmtNgn(usd, rate, locale)})`;

export const fmtDate = (s: string, locale?: string) =>
  new Date(s).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

export const fmtDateShort = (s: string, locale?: string) =>
  new Date(s).toLocaleDateString(locale, { dateStyle: "medium" });

export const fmtMoney = (n: number, currency: string, locale?: string) => {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(n) || 0);
  } catch {
    return `${currency} ${Number(n).toLocaleString(locale)}`;
  }
};

export const SUPPORTED_LOCALES: { value: string; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-NG", label: "English (Nigeria)" },
  { value: "fr-FR", label: "Français (France)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "ar-EG", label: "العربية (مصر)" },
];
