
revoke execute on function public.notify_user(uuid,text,text,public.notification_kind,text) from anon, authenticated, public;
revoke execute on function public.tg_notify_request_insert() from anon, authenticated, public;
revoke execute on function public.tg_notify_request_resolved() from anon, authenticated, public;
revoke execute on function public.tg_notify_txn_insert() from anon, authenticated, public;
revoke execute on function public.tg_notify_bank_change() from anon, authenticated, public;
revoke execute on function public.tg_apply_per_usd_rules() from anon, authenticated, public;
revoke execute on function public.run_due_fund_rules() from anon, authenticated, public;
