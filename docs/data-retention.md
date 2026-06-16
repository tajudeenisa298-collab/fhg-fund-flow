# Data Retention Policy

## Member accounts
- **Active / suspended**: retained indefinitely while the account is in use.
- **Terminated**: profile is preserved for **90 days** to allow a leader to issue a pardon (`pardon_member`).
- **Finalized** (terminated > 90 days, processed by `finalize_terminated_members`): the profile row stays so historical transactions remain attributable, but the account no longer has any role and its downline has been reassigned.
- **Anonymized**: **2 years after finalization** the daily job `anonymize_finalized_members()` scrubs identifying fields:
  - `profiles`: `full_name → 'Former member'`, `email → NULL`, `whatsapp_number → NULL`, `avatar_url → NULL`, suspension/termination reasons cleared.
  - `bank_accounts`, `login_devices`, `notifications` rows for that user are deleted.
  - `transactions`, `withdrawal_requests`, `upkeep_dispensations`, `member_status_log`, `admin_audit_log` are **kept** — they are the financial/audit record.

Scheduled via `pg_cron` job `anonymize-finalized-daily` (03:15 UTC daily).

## Audit log
`admin_audit_log` records the following sensitive RPCs and is append-only (UPDATE/DELETE are blocked by trigger):
- `promote_member`
- `promote_member_to_leader`
- `resolve_withdrawal_request`
- `leader_purse_withdraw`
- `reverse_transaction`
- `record_office_expense`

Rows are visible to the actor and the target user via RLS; service role can read everything for compliance exports. Audit rows are **never** anonymized.
