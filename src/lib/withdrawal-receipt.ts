import { fmtUsd, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ReceiptData {
  id: string;
  amount_usd: number;
  description: string | null;
  member_name: string;
  leader_name?: string | null;
  resolved_at: string | null;
  created_at: string;
  snapshot_currency?: string | null;
  snapshot_local_amount?: number | null;
  snapshot_rate?: number | null;
  leader_note?: string | null;
}

/** Open a printable receipt for an approved withdrawal in a new window. */
export async function printWithdrawalReceipt(r: ReceiptData) {
  const localLine =
    r.snapshot_currency && r.snapshot_local_amount && r.snapshot_rate
      ? `${r.snapshot_currency} ${r.snapshot_local_amount.toLocaleString()} @ ${r.snapshot_rate}`
      : "—";
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
    );
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Withdrawal receipt · ${esc(r.id.slice(0, 8))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         color: #0f172a; margin: 0; padding: 40px; background: #f8fafc; }
  .sheet { max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0;
           border-radius: 16px; padding: 32px 36px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .muted { color: #64748b; font-size: 12px; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0;
         border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .row:last-child { border-bottom: 0; }
  .label { color: #475569; }
  .amount { font-size: 32px; font-weight: 600; margin: 16px 0; }
  .stamp { display: inline-block; padding: 4px 12px; border-radius: 999px;
           background: #dcfce7; color: #166534; font-size: 12px; font-weight: 600;
           text-transform: uppercase; letter-spacing: .04em; }
  .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: 0; border-radius: 0; }
    .noprint { display: none; }
  }
  .btn { background:#0f172a;color:#fff;border:0;padding:8px 14px;border-radius:8px;
         font-size:13px;cursor:pointer; }
</style>
</head>
<body>
  <div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h1>Withdrawal receipt</h1>
        <p class="muted">Receipt #${esc(r.id.slice(0, 8).toUpperCase())}</p>
      </div>
      <span class="stamp">Approved</span>
    </div>
    <div class="amount">${esc(fmtUsd(r.amount_usd))}</div>
    <div class="row"><span class="label">Member</span><span>${esc(r.member_name)}</span></div>
    ${r.leader_name ? `<div class="row"><span class="label">Approved by</span><span>${esc(r.leader_name)}</span></div>` : ""}
    <div class="row"><span class="label">Requested</span><span>${esc(fmtDate(r.created_at))}</span></div>
    <div class="row"><span class="label">Approved</span><span>${esc(r.resolved_at ? fmtDate(r.resolved_at) : "—")}</span></div>
    <div class="row"><span class="label">Local amount</span><span>${esc(localLine)}</span></div>
    <div class="row"><span class="label">Reason</span><span style="max-width:60%;text-align:right;">${esc(r.description ?? "—")}</span></div>
    ${r.leader_note ? `<div class="row"><span class="label">Leader note</span><span style="max-width:60%;text-align:right;font-style:italic;">${esc(r.leader_note)}</span></div>` : ""}
    <div class="row"><span class="label">Receipt hash (sha256)</span><span style="font-family:ui-monospace,monospace;font-size:10px;max-width:60%;text-align:right;word-break:break-all;">__SHA256__</span></div>
    <p class="footer">Generated ${esc(new Date().toLocaleString())} · Verify hash against the audit log</p>
    <div class="noprint" style="text-align:center;margin-top:24px;">
      <button class="btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
  <script>setTimeout(() => window.print(), 350);</script>
</body>
</html>`;
  // Compute deterministic hash of receipt body (without the hash placeholder itself)
  const hashable = html.replace("__SHA256__", "");
  const hash = await sha256Hex(hashable);
  const finalHtml = html.replace("__SHA256__", hash);

  // Persist hash on the withdrawal row (idempotent; one-shot per receipt)
  void supabase.rpc("set_withdrawal_receipt_hash" as never, { _id: r.id, _sha256: hash } as never);

  const w = window.open("", "_blank", "noopener,noreferrer,width=780,height=900");
  if (!w) return;
  w.document.write(finalHtml);
  w.document.close();
}
