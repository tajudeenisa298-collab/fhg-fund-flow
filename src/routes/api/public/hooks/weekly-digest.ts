import { createFileRoute } from "@tanstack/react-router";

/**
 * Weekly digest endpoint, called by pg_cron once a week.
 *
 * Sends "Your team this week" to every leader: a quick summary of new
 * deposits, withdrawals approved, members suspended, and pending requests.
 *
 * Email delivery uses the Resend connector gateway. Without RESEND_API_KEY +
 * LOVABLE_API_KEY the route still computes the digest and logs it — useful
 * for testing before the user wires up the Resend connection. Wire it via
 * Settings → Connectors → Resend and add a verified sender domain.
 */
export const Route = createFileRoute("/api/public/hooks/weekly-digest")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Every leader
        const { data: leaderRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "leader");
        const leaderIds = ((leaderRoles ?? []) as { user_id: string }[]).map((r) => r.user_id);
        if (leaderIds.length === 0) {
          return Response.json({ ok: true, sent: 0, reason: "no leaders" });
        }

        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const results: { leader: string; status: string }[] = [];

        for (const leaderId of leaderIds) {
          const [{ data: leader }, { data: txns }, { data: requests }, { data: statusLog }] = await Promise.all([
            supabaseAdmin.from("profiles").select("id, full_name, email").eq("id", leaderId).maybeSingle(),
            supabaseAdmin
              .from("transactions")
              .select("type, amount_usd, created_at")
              .eq("leader_id", leaderId)
              .gte("created_at", since),
            supabaseAdmin
              .from("withdrawal_requests")
              .select("status, created_at")
              .eq("leader_id", leaderId)
              .gte("created_at", since),
            supabaseAdmin
              .from("member_status_log")
              .select("action, created_at, member_id, leader_id")
              .eq("leader_id", leaderId)
              .gte("created_at", since),
          ]);

          if (!leader?.email) {
            results.push({ leader: leaderId, status: "skipped:no-email" });
            continue;
          }

          const tx = (txns ?? []) as { type: string; amount_usd: number | string }[];
          const deposits = tx.filter((t) => t.type === "deposit").reduce((a, b) => a + Number(b.amount_usd), 0);
          const withdrawals = tx.filter((t) => t.type === "withdrawal").reduce((a, b) => a + Math.abs(Number(b.amount_usd)), 0);
          const req = (requests ?? []) as { status: string }[];
          const pending = req.filter((r) => r.status === "pending").length;
          const approved = req.filter((r) => r.status === "approved").length;
          const suspended = ((statusLog ?? []) as { action: string }[]).filter((l) => l.action === "suspend").length;

          const html = renderDigest({
            name: leader.full_name,
            deposits,
            withdrawals,
            pending,
            approved,
            suspended,
          });

          const sendResult = await sendViaResend({
            to: leader.email,
            subject: "Your team this week",
            html,
          });
          results.push({ leader: leaderId, status: sendResult });
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

function renderDigest(d: {
  name: string;
  deposits: number;
  withdrawals: number;
  pending: number;
  approved: number;
  suspended: number;
}) {
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;background:#f6f7fb;margin:0;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
    <h1 style="margin:0 0 8px;font-size:20px">Hi ${escape(d.name.split(" ")[0])},</h1>
    <p style="margin:0 0 16px;color:#475569">Here's what happened in your team this week:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px 0;color:#475569">Deposits</td><td style="text-align:right;font-weight:600">${fmt(d.deposits)}</td></tr>
      <tr><td style="padding:8px 0;color:#475569">Withdrawals approved</td><td style="text-align:right;font-weight:600">${fmt(d.withdrawals)}</td></tr>
      <tr><td style="padding:8px 0;color:#475569">Pending requests</td><td style="text-align:right;font-weight:600">${d.pending}</td></tr>
      <tr><td style="padding:8px 0;color:#475569">Members suspended</td><td style="text-align:right;font-weight:600">${d.suspended}</td></tr>
      <tr><td style="padding:8px 0;color:#475569">Requests approved</td><td style="text-align:right;font-weight:600">${d.approved}</td></tr>
    </table>
    <p style="margin:24px 0 0"><a href="https://fhg-fund-flow.lovable.app/dashboard" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;display:inline-block;font-size:14px">Open dashboard</a></p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px">You're getting this because you lead a team on FHG Funds.</p>
  </div>
</body></html>`;
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

async function sendViaResend({ to, subject, html }: { to: string; subject: string; html: string }): Promise<string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    console.info("[weekly-digest] would send", { to, subject, len: html.length });
    return "logged-only:missing-resend";
  }
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM ?? "FHG Funds <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[weekly-digest] resend error", res.status, body);
      return `error:${res.status}`;
    }
    return "sent";
  } catch (e) {
    console.error("[weekly-digest] threw", e);
    return "error:exception";
  }
}
