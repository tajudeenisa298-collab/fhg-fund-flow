import * as Sentry from "@sentry/react";

/**
 * Initialise Sentry on the client. Safe no-op when VITE_SENTRY_DSN is not set,
 * so local dev / preview without a DSN never spam errors. Wire a DSN in
 * Settings → Secrets to flip it on.
 */
let inited = false;
export function initObservability() {
  if (inited || typeof window === "undefined") return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
  inited = true;
}

/** Structured logger — always logs to console, forwards to Sentry when up. */
export const log = {
  info(msg: string, extra?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.info(`[info] ${msg}`, extra ?? {});
    if (inited) Sentry.addBreadcrumb({ category: "log", level: "info", message: msg, data: extra });
  },
  warn(msg: string, extra?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.warn(`[warn] ${msg}`, extra ?? {});
    if (inited) Sentry.captureMessage(msg, { level: "warning", extra });
  },
  error(err: unknown, extra?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.error("[error]", err, extra ?? {});
    if (inited) {
      if (err instanceof Error) Sentry.captureException(err, { extra });
      else Sentry.captureMessage(String(err), { level: "error", extra });
    }
  },
};
