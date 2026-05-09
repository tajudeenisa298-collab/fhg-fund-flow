import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron-invoked endpoint. Runs both the legacy upkeep stipend processor
 * and the new flexible fund-rule processor.
 */
export const Route = createFileRoute("/api/public/hooks/run-upkeep")({
  server: {
    handlers: {
      POST: async () => {
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
          return new Response(
            JSON.stringify({
              ok: false,
              error: up.error?.message ?? fr.error?.message,
            }),
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
