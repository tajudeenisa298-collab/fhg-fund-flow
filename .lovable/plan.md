## Goal
Stop the Admin tab from rendering the global "This page didn't load" fallback when one section throws, and capture the actual error so the underlying cause can be fixed.

## What's happening
The `/dashboard/admin` URL renders successfully on the server (logs show `200`). The "Page didn't load" screen is the root `errorComponent` in `src/routes/__root.tsx` — it fires when a React component throws during render. On the Admin tab, the leader view renders four sections in sequence:
- `CronHealthSection` (Scheduled jobs)
- `AdminAuditFeed` (Audit feed)
- `AnnouncementsSection` (Announcements, manage mode)
- `ResourceLibrarySection` (Resource library, manage mode)

If any one of these throws, the whole page goes to the error fallback and we can't tell which.

## Plan

### 1. Add a small reusable section error boundary
New file `src/components/section-error-boundary.tsx`:
- Class component implementing `componentDidCatch`.
- On error: render a compact inline card ("This section couldn't load — <message>") with a "Try again" button that resets the boundary.
- `console.error` the error + component stack so it shows up in the browser console and gets captured by observability.

### 2. Wrap each admin section in `leader-view.tsx`
Wrap the four `MobileCollapsible` blocks gated by `show("admin")` (Scheduled jobs, Audit feed, Announcements, Resource library) individually with `<SectionErrorBoundary name="...">`. Same for the two `show("admin")` blocks in `member-view.tsx` (PV log for self, announcements + resource library readonly) so members get the same protection.

This guarantees the Admin tab always renders, and any broken section labels itself with its real error message.

### 3. Verify and fix the underlying cause
Once boundaries are in place I'll ask you to reload the Admin tab. Whichever section card shows the error gives us the exact failing component + message. From there I'll patch the root cause (most likely candidates, in order: a missing/renamed RPC like `get_cron_health`, an RLS denial on `admin_audit_log`, or a profile field assumption that's null for your account).

## Out of scope
No changes to auth flow, routing, or other tabs. The error boundary is presentation-only; no business logic moves.
