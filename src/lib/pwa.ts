/**
 * PWA registration wrapper.
 *
 * Manifest-only install + minimal offline behavior:
 * - Web app manifest is served from /manifest.webmanifest with brand colors so
 *   members can "Add to Home Screen" and launch in standalone mode.
 * - For last-known balance offline we cache the value in localStorage on every
 *   fetch (see auth-context); the dashboard reads from cache before the
 *   network resolves. This avoids the complexity of a full service worker
 *   while still delivering the "see your balance offline" promise.
 *
 * No service worker is registered here on purpose — Lovable previews share
 * an origin and a misregistered SW can wedge other projects. If the user
 * later asks for full app-shell offline, switch to vite-plugin-pwa with the
 * preview guards documented in the PWA skill.
 */
export function setupPwa() {
  if (typeof window === "undefined") return;
  // Defensive cleanup: if a previous build accidentally registered an app SW,
  // unregister it so stale chunks can't poison the preview.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations?.().then((regs) => {
      for (const r of regs) {
        const scriptURL = r.active?.scriptURL ?? "";
        if (/\/(sw|service-worker)\.js$/.test(scriptURL)) r.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
}

export const BALANCE_CACHE_KEY = "fhg.balance.cache.v1";

export function cacheBalance(userId: string, balanceUsd: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BALANCE_CACHE_KEY,
      JSON.stringify({ userId, balanceUsd, at: Date.now() }),
    );
  } catch {
    /* quota exceeded — ignore */
  }
}

export function readCachedBalance(userId: string): { balanceUsd: number; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BALANCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; balanceUsd: number; at: number };
    if (parsed.userId !== userId) return null;
    return { balanceUsd: parsed.balanceUsd, at: parsed.at };
  } catch {
    return null;
  }
}
