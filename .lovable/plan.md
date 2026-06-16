# Enhancement Plan

Bundled improvements across notifications, leader/member UX, security, and polish. Each slice is independent — pick and choose, or approve all.

## 1. New notification triggers (your ask)

Add DB triggers that fan out `notifications` rows when:

- **Fund rule added / updated / deactivated** — notify every member in the leader's downline. Message: *"New team rule: 5% per deposit → Office support"* with link to the rules page.
- **Exchange rate updated** (`app_settings.fx_rates` change) — notify every user. Message: *"USD ↔ NGN rate updated: ₦1,600 → ₦1,650"*. Throttle: skip if the change is <0.5% to avoid noise.
- **Bonus low-cost wins while we're in the trigger file:**
  - Dispensation resolved → notify member
  - Office expense logged → notify downline leaders (optional toggle)

Also add per-user notification preferences in `/settings` (toggle each category) so people aren't spammed.

## 2. Leader dashboard UX

- **Sticky summary bar** on mobile showing total funds + pending count (currently you scroll past stats).
- **Quick-filter chips** on members list: `Has debt`, `Inactive 30d`, `Pending upkeep`, `New this week`.
- **Bulk dispense** — select multiple members, dispense same upkeep in one go (extends `bulk-actions-bar.tsx`).
- **Member search** with fuzzy match on name/email/phone (currently no search on downline).
- **Inline rate editor** — leader can update FX rate from dashboard without going to settings.
- **Export** transactions/members to CSV from the dashboard (download button).

## 3. Member experience

- **Balance trend sparkline** on the dashboard balance card (last 30d).
- **"Why this deduction?"** — clicking any deduction txn opens a tooltip explaining which fund rule produced it.
- **Upcoming deductions preview** — show what rules will hit in the next 7 days and the projected balance.
- **Receipt download** on every transaction (PDF, reuses `withdrawal-receipt.ts`).
- **Onboarding tour** — first-login coach marks for balance, history, rules, invite code.

## 4. Security & reliability

- **Rate-limit invite code minting** (1 per user per minute) — prevents enumeration spam.
- **Audit log retention policy** — auto-archive entries >180 days into a cold table.
- **Cron failure → toast for root leader on login** if any alert is unread.
- **Session activity page** in settings: list active devices with revoke button (table `login_devices` already exists).
- **2FA via email OTP** for sensitive actions (large dispensation, role change, FX edit).
- **Soft-delete** for transactions instead of hard delete (keeps audit trail).

## 5. Performance & polish

- **Skeleton loaders** on every async section (some currently flash empty).
- **Optimistic UI** for dispense / acknowledge / dispute actions (instant feedback, rollback on error).
- **Image lazy-load** for proof screenshots in dispensation lists.
- **Keyboard shortcuts**: `g d` dashboard, `g s` settings, `/` search, `n` notifications.
- **Dark mode** pass — audit a few hardcoded colors and route them through tokens.
- **Mobile bottom-nav badge** for unread notifications count.

---

## Recommendation

If you want one focused slice this round, I'd ship **#1 (notifications) + the search and quick-filters from #2** — biggest day-to-day impact and ~1 migration + a few components.

Reply with which numbers (or specific bullets) to build, and I'll start.
