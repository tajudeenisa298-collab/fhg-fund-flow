# End-to-end smoke tests

Playwright covers the entry surfaces for the 5 critical flows:

1. Signup — `/signup` form renders
2. Login — `/login` form renders (deposits are leader-driven, so a logged-in member is needed for full coverage)
3. Withdrawal request → approval — guarded by `/dashboard` route (redirect when signed out)
4. Dispense upkeep — same guard, deeper assertions need seeded fixtures
5. Suspend / status change — same guard

## Run locally

```bash
bunx playwright install --with-deps
bun run dev &
bunx playwright test
```

## Run against a deployed preview

```bash
BASE_URL=https://your-preview.lovable.app bunx playwright test
```

## Extending coverage

Full happy-path coverage needs a seeded leader + member pair. Add a
fixture that signs in via `supabase.auth.signInWithPassword` against a
dedicated test project, then drive the UI from there. Keep destructive
tests out of production projects.
