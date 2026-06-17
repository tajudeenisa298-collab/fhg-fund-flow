## Goal

Round out the app with: clickable notifications, two new leader powers (balance adjust, rank override), in-app withdrawal approvals, a hard lock on PV once charged, plus mobile polish, persistent filters, and security hardening.

---

## 1. Notification bell — click-through to details / target page

Every notification already has a `kind` and an optional `link`. We'll make taps useful:

- In the bell popover and on `/notifications`, clicking a row:
  1. Marks it read.
  2. If `link` is set → navigate there.
  3. Otherwise open a **Notification detail dialog** showing title, full body, kind chip, timestamp, and a "Go to …" button when we can derive a target from `kind` (e.g. withdrawal → `/dashboard/money`, dispute → the dispute thread, fund-rule change → `/dashboard/money`, announcement → `/notifications/<id>`).
- Backfill `link` in every `notify_user()` call site so future notifications always deep-link (DB-side, one migration touching the `tg_notify_*` triggers).
- Add **filter chips** (Unread / Money / Team / System) and **Mark all read** to `/notifications`.

## 2. Leader authority — additions

### 2a. Adjust member balance (credit / debit) with reason
- New leader-only dialog on the member detail screen: amount + currency (CurrencyAmountInput, NGN/USD), reason (required, ≥10 chars), direction (credit/debit).
- Backed by a new RPC `leader_adjust_balance(member_id, amount_usd, direction, reason)`:
  - Asserts caller is the member's `leader_id` and `can_handle_funds`.
  - Writes a `transactions` row of type `adjustment` with the note.
  - Hard caps: max **$500 / member / day** and **$2,000 / leader / day**; over-cap requires the existing two-leader approval flow.
  - Always logged to `admin_audit_log` + member notification.

### 2b. Force-set / override a member's rank
- Add to the member action menu: "Override rank…" (separate from the existing `promote_member` flow).
- New RPC `leader_override_rank(member_id, new_rank, reason)`:
  - Same leader-scope check; reason required.
  - Writes to `member_status_log` with action `rank_override` and notifies the member.
  - Triggers the existing `sync_upkeep_plan_from_rank_default` so upkeep updates automatically.

### 2c. Approve / deny member withdrawals in-app
- Promote the existing two-leader approval into a first-class **Withdrawal approvals** card on `/dashboard/money` (leader view):
  - Pending list with member, amount, bank, receipt link.
  - One-tap **Approve** / **Deny** (deny requires reason).
  - On approve: receipt upload prompt + calls existing `resolve_withdrawal_request`.
  - Realtime-subscribed so a new request appears instantly and fires a notification.

## 3. Leader authority — revoke / tighten

### 3a. PV edit lock after deduction
Already true for `pv_logs.txn_id IS NOT NULL`; extend the same rule to:
- `upkeep_dispensations` once `txn_id` is set (no edits, only `reverse_transaction`).
- `transactions` of type `adjustment` (leaders can't silently update — only `reverse_transaction` within `reversal_window_until`).
- Enforced both in the UI (disabled edit buttons + tooltip) and via DB triggers that block UPDATE when a linked txn exists.

## 4. Audit, security & rate-limits

- **Admin audit feed** on `/dashboard/admin` (already have `admin_audit_log`): table with actor, action, target, reason, timestamp, CSV export.
- **Device / session list** in `/settings`: read from `login_devices`, show last-seen + IP city, "Revoke this device" button (signs out that refresh token via `supabaseAdmin.auth.admin.signOut(user, scope:"others")`).
- **Login alert notification** when a new device first appears.
- **HIBP leaked-password check** enabled via `configure_auth` so weak passwords are rejected at signup / change.
- **Rate-limit guards** (DB-side, mirrors the existing withdrawal pattern) on: `leader_adjust_balance`, `leader_override_rank`, `log_pv_with_deduction`, `generate_invite_code` (5/min/leader, already 2-min expiry).

## 5. Search, filters & saved views

- Sticky filter bar persisted in the URL (`?q=&rank=&status=`) on Team, Money, Structure — uses the saved-views infra you already have.
- **Global member search** in the header (⌘K / mobile search icon) — searches name/email/whatsapp within the caller's downline, jumps to member detail.
- **CSV export** button on every table (Members, Transactions, Withdrawals, PV log, Office ledger, Dispensations).

## 6. Mobile polish

- Convert wide tables (members, transactions, withdrawals, dispensations) to card lists below `md`, with swipe-left for primary action and tap for detail.
- Make every Dialog full-screen on `< sm` with sticky footer for the primary CTA so the keyboard doesn't bury "Save".
- Bottom-nav: hide on scroll-down, show on scroll-up; add a tiny unread-count dot on the relevant section icon.
- Audit toasts to make sure they appear **above** the bottom-nav, not behind it.

## 7. Realtime upgrades (already partly enabled)

- Subscribe leaders to `withdrawal_requests`, `upkeep_dispensations`, `pv_logs`, `transactions` filtered by their downline so dashboards live-update without refresh.
- Single root-level `onAuthStateChange` listener is already in place — we'll only add per-component channels with proper teardown.

---

## Technical notes

- All new RPCs are `SECURITY DEFINER`, `SET search_path = public`, with explicit leader/role checks at the top — no anonymous access.
- Caps live in `app_settings` so you can tune them later without a code deploy.
- One migration covers: link backfill in `tg_notify_*`, the three new RPCs, the two new UPDATE-guard triggers, and rate-limit helpers.
- No new tables required; `admin_audit_log`, `member_status_log`, `login_devices`, `notifications`, `transactions` all already exist.

## Out of scope (ask separately if you want them)

- Email/SMS digest of notifications.
- Per-leader custom rank labels.
- Two-factor auth.
