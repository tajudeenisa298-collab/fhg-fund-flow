## Overview

Big batch of features across DB, auth, member view, leader view, and a new settings page. I'll group into 5 slices and ship in one go.

## 1. NGN display everywhere

- Add an app-wide USD→NGN rate (single-row `app_settings` table, leader-editable; default e.g. 1600).
- Build a `fmtNgn(usd)` helper that uses the rate.
- Show `(₦ X)` next to every USD balance/amount in member view, leader view, stat cards, withdrawal lists, transactions table.

## 2. 18 NeoLife ranks + fund-handler permission

- Replace freeform `rank` text with an enum/lookup of the 18 ranks (Member → 5 Diamond Director).
- Add `can_handle_funds boolean` on `profiles` (default false). Auto-true when rank ≥ Director.
- Update `promote_member_to_leader` → generic `promote_member(_member_id, _new_rank, _grant_leader bool, _note)`. Granting leader role / detaching from upline only happens when rank ≥ Director OR `_grant_leader` explicitly true (lets a lower rank still handle funds when manually allowed).
- Leader UI: rank dropdown with all 18 stages + "allow to handle funds" checkbox for sub-Director cases. Promote dialog reused.

## 3. Team upkeep (recurring stipend)

- New `upkeep_plans` table: `leader_id`, `member_id` (nullable = whole team default), `amount_usd`, `frequency` (enum: every_3_days, weekly, biweekly, monthly, custom_days), `custom_days int`, `next_run_at`, `active`.
- Cron job (pg_cron, daily) calls a server route `/api/public/hooks/run-upkeep` that, for every plan where `next_run_at <= now() AND active`, inserts a `transaction` of type `deposit` (with note "Upkeep") for the member and bumps `next_run_at`.
- Leader UI: "Upkeep schedules" section to create/edit/pause plans per member or team-wide.

## 4. Invite codes expire in 20 min + live countdown

- Add `expires_at timestamptz` to `invite_codes` (default `now() + interval '20 minutes'`).
- Update `validate_invite_code` to also check `expires_at > now()`.
- Leader UI invite code list: show MM:SS countdown via `setInterval`; hide row entirely once expired or used.

## 5. Bank details + email-verification on change

- New table `bank_accounts`: `user_id` (unique), `bank_name`, `account_number`, `account_owner_name`, timestamps. RLS: owner only.
- Constant list of all banks (commercial, merchant, non-interest, PSB, mortgage, MMOs) bundled in `src/lib/banks.ts` — Combobox with type-ahead in signup + settings.
- Signup flow: after auth signup, prompt for bank details (optional skip but encouraged) → insert into `bank_accounts`.
- Settings page `/settings`: shows current details. To change, user clicks "Edit" → server fn emails a 6-digit OTP to their account email (Lovable Cloud built-in email), user enters code → updates the row.
- Use a `bank_change_codes` table: `user_id`, `code_hash`, `expires_at` (10 min), `consumed_at`.

## Technical notes

- Email infra: I'll set up Lovable email infra + scaffold transactional templates for the bank-change OTP.
- `app_role` already has `member` and `leader` — `can_handle_funds` flag (separate from role) lets non-Directors still operate the leader UI when permitted.
- `RANKS` array in `src/lib/ranks.ts` with display order index drives the dropdown and "≥ Director" comparisons.

## Out of scope (will note to user)

- Bank account number length validation per bank (Nigerian banks aren't uniform; I'll just enforce 10-digit NUBAN as a soft check).
- Real bank-name verification via a payments API (would need a connector).

Confirm and I'll build it.