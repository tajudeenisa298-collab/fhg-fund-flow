## Overview

Seven coordinated changes across DB, server, and UI. I'll batch them into 4 implementation slices so each ships verifiable.

⚠️ Important note on the test key: you pasted your `sk_test_...` Paystack key in plain chat. It will be stored as a server-side secret (never bundled to the browser), but **please rotate it in your Paystack dashboard after this**, since it's now in chat history. I'll prompt you to enter the (rotated) key via the secrets tool — don't paste it in chat again.

---

## Slice 1 — Paystack bank verification

**DB**
- Add `bank_code text` to `bank_accounts` and a new `verified_at timestamptz`.
- Seed a `paystack_banks` lookup table (`name`, `code`, `slug`, `active`) — populated on first server call from Paystack `/bank` and cached.

**Server**
- New server route `POST /api/public/hooks/paystack-resolve` — wait, that's public. Use a **protected server function** instead: `resolveBankAccount` (`createServerFn` + `requireSupabaseAuth`) that calls `https://api.paystack.co/bank/resolve?account_number=…&bank_code=…` with `Authorization: Bearer ${PAYSTACK_SECRET_KEY}`. Validates 10-digit number, returns `{ account_name, status }`.
- Second fn `listPaystackBanks` — proxies/caches `/bank` (NGN, type=nuban).

**Frontend**
- `BankCombobox` switched to fetch from `listPaystackBanks` (returns name+code).
- Settings + Signup: account number input → debounced 600ms → call `resolveBankAccount` → show spinner → show verified name (read-only confirmation) → save button enabled only when verified.

**Secret**: request `PAYSTACK_SECRET_KEY` via `add_secret` tool. (You'll re-enter the rotated key.)

---

## Slice 2 — NGN-first currency

- Flip `fmtUsdNgn` → `fmtNgnUsd(usd, rate)` returns `"₦160,000"` with `"$100"` shown smaller below (component, not string).
- New `<Money usd rate />` component renders primary NGN line + muted USD line.
- Replace existing `fmtUsdNgn` usages in `leader-view`, `member-view`, `dashboard`, `settings`, `invite-code-row` with `<Money>`.
- Inputs: leader's "add deposit" / upkeep amount fields stay USD-entry (since exchange varies), but show live NGN preview underneath.
- App settings page: editable `usd_to_ngn` rate input for leaders.

---

## Slice 3 — Notifications

**DB**
- New `notifications` table: `id, user_id, title, body, kind enum(request_new|request_resolved|deposit|bank_updated|upkeep|generic), link text, read_at timestamptz, created_at`.
- RLS: users see/update only their own.
- Triggers:
  - On `withdrawal_requests` insert → notify the leader.
  - On `withdrawal_requests` update (status change) → notify the member.
  - On `transactions` insert (deposit/release) → notify the member.
  - On `bank_accounts` insert/update → notify user + their leader.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`.

**Frontend**
- `<NotificationBell />` in dashboard header: badge count of unread, popover list (title, body, relative time, unread dot). Click row → mark read + navigate to `link`.
- Realtime subscription in auth context for live updates.

---

## Slice 4 — Clickable members + flexible fund rules

**Member detail**
- Click a row in leader-view team list → opens `<MemberDetailDialog>` (or route `/dashboard/member/$id`).
- Shows: profile, totals (paid / pending / approved / rejected / per-fund deductions), full transaction list with date, type, status, note, linked bank.
- Reuses RLS: leader can already select team transactions/profiles/bank.

**Fund rules (replaces simple upkeep)**
- New `fund_rules` table: `id, leader_id, name, kind enum(per_usd|fixed), amount_ngn numeric, frequency enum(one_time|weekly|biweekly|monthly|custom_days), custom_days, active bool, description, created_at, updated_at`.
  - `per_usd`: when leader records a deposit of $X, system auto-creates a deduction transaction of `amount_ngn × X` (converted back to USD at current rate for storage consistency).
  - `fixed`: behaves like upkeep — recurring deduction via cron.
- Migrate existing `upkeep_plans` data into `fund_rules` as `kind=fixed` (keep upkeep_plans for now, mark deprecated).
- New transaction `type` enum value: `'fund_deduction'` (`apply_transaction_to_balance` already handles via existing categories — extend trigger to subtract for `fund_deduction`).
- Extend `run_due_upkeep` → `run_due_fund_rules` cron job.
- Leader settings UI: list fund rules, add/edit/delete, toggle active. Per-rule frequency picker + amount with kind toggle.
- When leader adds a deposit, server fn `recordDeposit` runs deposit + applies all active `per_usd` rules atomically.

**Member detail "deductions breakdown"** ties back to fund_rules by name.

---

## Out of scope (call out now)

- Live Paystack switchover (you'll just swap the secret value via secrets tool when ready — no code change needed).
- Per-bank account number length variation (Paystack handles validation server-side).
- Push/email notifications (in-app only).
- Multi-currency beyond NGN/USD.

---

## Order of operations

1. Slice 1 migration + secret prompt + server fns + UI.
2. Slice 2 NGN-first refactor.
3. Slice 3 notifications migration + bell.
4. Slice 4 fund rules migration + member detail + leader settings.

Approve and I'll start with Slice 1 (which begins by asking you to enter the rotated Paystack key).