import { fmtDate, fmtMoney, fmtUsd } from "@/lib/format";
import type { Transaction } from "@/lib/types";

interface StatementInput {
  member_name: string;
  member_email: string | null;
  locale?: string;
  balance_usd: number | string;
  /** Window length in days (default 90) */
  days?: number;
  transactions: Transaction[];
}

const TYPE_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  release: "Release",
  adjustment: "Adjustment",
  fund_deduction: "Fund deduction",
  bank_fee: "Bank fee",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

/**
 * Opens a print-ready statement in a new window.
 * User picks "Save as PDF" from the print dialog.
 */
export function printMemberStatement(input: StatementInput) {
  const days = input.days ?? 90;
  const cutoff = Date.now() - days * 86400000;
  const rows = input.transactions
    .filter((t) => new Date(t.created_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalIn = rows
    .filter((t) => t.type === "deposit" || t.type === "adjustment")
    .reduce((s, t) => s + Number(t.amount_usd), 0);
  const totalOut = rows
    .filter((t) => t.type !== "deposit" && t.type !== "adjustment")
    .reduce((s, t) => s + Number(t.amount_usd), 0);

  const today = new Date();
  const periodEnd = today.toLocaleDateString(input.locale, { dateStyle: "medium" });
  const periodStart = new Date(cutoff).toLocaleDateString(input.locale, { dateStyle: "medium" });

  const body = rows
    .map((t) => {
      const sign = t.type === "withdrawal" || t.type === "release" ? "−" : "+";
      const local =
        t.local_amount && t.currency !== "USD"
          ? `${fmtMoney(Number(t.local_amount), t.currency, input.locale)} @ ${t.exchange_rate ?? ""}`
          : "—";
      return `
        <tr>
          <td>${esc(fmtDate(t.created_at, input.locale))}</td>
          <td>${esc(TYPE_LABEL[t.type] ?? t.type)}</td>
          <td>${esc(t.note ?? "—")}</td>
          <td class="num">${sign}${esc(fmtUsd(Number(t.amount_usd), input.locale))}</td>
          <td class="num muted">${esc(local)}</td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Statement — ${esc(input.member_name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 32px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
  h1 { margin: 0; font-size: 22px; }
  .muted { color: #666; }
  .meta { text-align: right; font-size: 12px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0 24px; }
  .summary div { padding: 12px 14px; border: 1px solid #ddd; border-radius: 10px; }
  .summary strong { display: block; font-size: 16px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background: #f6f6f6; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  footer { margin-top: 32px; font-size: 11px; color: #888; text-align: center; }
  .empty { text-align: center; padding: 40px; color: #888; }
  @media print { body { margin: 16mm; } .noprint { display: none; } }
  .btn { padding: 8px 14px; border-radius: 8px; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Account statement</h1>
      <div class="muted">${esc(input.member_name)}${input.member_email ? ` · ${esc(input.member_email)}` : ""}</div>
    </div>
    <div class="meta">
      <div><strong>Period</strong></div>
      <div>${esc(periodStart)} → ${esc(periodEnd)}</div>
      <div class="muted">Last ${days} days</div>
    </div>
  </header>

  <div class="summary">
    <div><span class="muted">Current balance</span><strong>${esc(fmtUsd(input.balance_usd, input.locale))}</strong></div>
    <div><span class="muted">Credits (period)</span><strong>+${esc(fmtUsd(totalIn, input.locale))}</strong></div>
    <div><span class="muted">Debits (period)</span><strong>−${esc(fmtUsd(totalOut, input.locale))}</strong></div>
  </div>

  ${
    rows.length === 0
      ? `<div class="empty">No transactions in this period.</div>`
      : `<table>
          <thead>
            <tr><th>When</th><th>Type</th><th>Note</th><th class="num">USD</th><th class="num">Local</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>`
  }

  <footer>Generated ${esc(today.toLocaleString(input.locale))} · FHG Funds</footer>

  <div class="noprint" style="margin-top:24px; text-align:center;">
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert("Allow pop-ups to download your statement.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
