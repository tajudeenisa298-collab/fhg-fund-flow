import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron-invoked endpoint. Runs the upkeep stipend processor and the
 * flexible fund-rule processor.
 *
 * Requires an `apikey` header matching the Supabase publishable (anon) key,
 * which the pg_cron job already sends. This blocks anonymous internet
 * callers from triggering financial scheduling logic.
 */
export const Route = createFileRoute("/api/public/hooks/run-upkeep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          return new Response(JSON.stringify({ ok: false }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const [up, fr] = await Promise.all([
          supabase.rpc("run_due_upkeep"),
          supabase.rpc("run_due_fund_rules"),
        ]);
        if (up.error || fr.error) {
          console.error("run-upkeep failed", up.error, fr.error);
          return new Response(
            JSON.stringify({ ok: false, error: "Internal error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            upkeep: up.data ?? 0,
            fund_rules: fr.data ?? 0,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
