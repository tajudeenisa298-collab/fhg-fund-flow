import { useCallback, useEffect, useState } from "react";

/**
 * Tiny URL-synced string state. Mirrors `useState<string>` but persists the
 * value in `?key=` via `history.replaceState` (no navigation, no rerender of
 * the router). Reads from the URL on mount. When the value equals
 * `defaultValue`, the param is removed to keep URLs clean.
 *
 * Intentionally framework-agnostic so it can be dropped into any component
 * without touching route `validateSearch`.
 */
export function useUrlState(
  key: string,
  defaultValue: string,
): [string, (next: string) => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return defaultValue;
    const v = new URL(window.location.href).searchParams.get(key);
    return v ?? defaultValue;
  });

  // Keep state in sync if URL changes elsewhere (back/forward).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const v = new URL(window.location.href).searchParams.get(key);
      setValue(v ?? defaultValue);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key, defaultValue]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const u = new URL(window.location.href);
      if (next === defaultValue || next === "") u.searchParams.delete(key);
      else u.searchParams.set(key, next);
      window.history.replaceState({}, "", u.toString());
    },
    [key, defaultValue],
  );

  return [value, set];
}
