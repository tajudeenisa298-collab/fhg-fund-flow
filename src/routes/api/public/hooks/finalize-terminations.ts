import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron-invoked endpoint. Permanently finalizes terminated accounts whose
 * 90-day pardon window has passed: stamps profiles.finalized_at and revokes
 * user_roles so the account can no longer act in the app.
 *
 * Requires a shared secret in the `apikey` or bearer token header. Prefer
 * CRON_SECRET in production; the publishable key fallback keeps existing
 * pg_cron jobs working until the secret is added there too.
 */
export const Route = createFileRoute("/api/public/hooks/finalize-terminations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const expected = process.env.CRON_SECRET ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
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
        const { data, error } = await supabase.rpc("finalize_terminated_members");
        if (error) {
          console.error("finalize-terminations failed", error);
          return new Response(
            JSON.stringify({ ok: false, error: "Internal error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ ok: true, finalized: data ?? 0 }),
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
