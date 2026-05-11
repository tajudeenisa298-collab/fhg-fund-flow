# Pyramid Sponsorship + Leader Finance Upgrade

This is a sizeable change. Below is what I'll build, grouped into 5 slices. I'll ship them in order so you can see progress.

## 1. Universal sponsorship (pyramid)

Today only leaders can invite. Change so **every signed-up user gets their own invite code** and becomes a sponsor for whoever they invite.

- Add `sponsor_id` to `profiles` (the direct upline — the person who invited you).
- Keep `leader_id` as "the person who actually manages your funds" (the nearest ancestor with `can_handle_funds = true`). Auto-recomputed when promotions happen.
- New recursive SQL function `get_downline(user_id)` returns the entire subtree (A → B → C → … → Z).
- New RLS: any user can `SELECT` profiles, transactions, balances of anyone in their downline (read-only). The fund-handling leader keeps write access.
- Invite codes table loses the leader-only restriction; anyone authenticated can mint a code tied to themselves.

When member B is later promoted to fund-handler, no migration of members is needed — B was already seeing their downline; now B simply gains the deposit/deduct buttons.

## 2. Gender on signup

- Add `gender` enum (`male | female | other | prefer_not_to_say`) to `profiles`.
- Required radio group on the signup form, editable later in `/settings`.

## 3. Multi-currency deposits + bank fees

When a leader records a deposit:

- Currency dropdown: USD, NGN, GBP, EUR (extensible).
- Optional **bank fee** field in the same currency.
- Logic: `net_local = gross_local - fee_local` → convert to USD using rate stored in `app_settings.fx_rates` (jsonb: `{ "USD":1, "NGN":1600, "GBP":1.27, "EUR":1.08 }`) → snapshot rate on the txn row (already done by `tg_snapshot_txn_rate`).
- The fee is recorded as a separate `bank_fee` transaction type so it's auditable and shown on the member's history.

## 4. Leader finance dashboard

New stat cards on the leader dashboard, each computed from existing `transactions` plus two new ledgers:

| Metric | Source |
|---|---|
| Total funds held | sum of all members' `balance_usd` (excluding office + leader purse) |
| Total members | count of leader's downline with `can_handle_funds = false` |
| Office support balance | new `office_ledger` rows, type `support_in/expense_out` |
| Office expenses (period) | sum of `office_ledger` `expense_out` |
| Team leader balance | new `leader_purse` per-leader, debit/credit rows |
| Total expenses | office expenses + leader withdrawals |
| Total debts | sum of negative balances across downline |
| Total credit balance | sum of positive balances across downline (excludes office + leader purse) |

New tables:
- `office_ledger(leader_id, kind: 'support_in'|'expense_out', amount_ngn, note, created_at)`
- `leader_purse_ledger(leader_id, kind: 'credit'|'debit', amount_usd, note, created_at)`

UI:
- "Log office expense" dialog (electricity, rent, etc.) → debits office balance.
- "Withdraw from leader balance" dialog → debits leader purse.
- Office support is auto-credited by existing `fund_rules` of kind `per_usd` (already deducting from members) — those NGN amounts now also credit `office_ledger` instead of just disappearing into a deduction note.

## 5. Visible fund rules + fee display for members

- New `<TeamFundRules />` card on the member dashboard listing every active rule from their leader: `"5% per deposit → Office"`, `"₦2,000 / week → TV fund"`, etc. Read-only, friendly copy.
- Member transaction history shows the bank fee row right under the deposit it belongs to (linked via `parent_txn_id`).

---

## Technical notes

- New txn types: `bank_fee`, `office_credit`, `office_expense`, `leader_credit`, `leader_debit`. Trigger `apply_transaction_to_balance` updated to ignore office/leader types for member balance.
- Recursive downline view uses `WITH RECURSIVE` on `profiles.sponsor_id`; cycle protection via depth limit (50).
- `<Money />` component already handles USD↔NGN with snapshotted rate — extended to accept any source currency.
- Backfill migration: copy existing `leader_id` into `sponsor_id` so current relationships are preserved.

---

## Out of scope for this round (ask me if you want them)

- Editing/deleting historical office or leader-purse entries (we'll only insert).
- Multi-level commission splits (e.g. A gets 1% of Z's deposit). The pyramid is *visibility-only* for now.

Reply **proceed** and I'll start with slice 1 (pyramid + gender), then continue through 5.
