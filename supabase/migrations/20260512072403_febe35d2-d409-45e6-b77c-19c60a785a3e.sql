REVOKE EXECUTE ON FUNCTION public.get_downline(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_descendant_of(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nearest_fund_handler(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_member(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_fund_handlers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_due_upkeep() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_fund_handlers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_snapshot_txn_rate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_invite_code(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_downline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_member(uuid, text, boolean, text) TO authenticated;