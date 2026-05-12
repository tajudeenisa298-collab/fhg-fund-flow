REVOKE EXECUTE ON FUNCTION public.get_downline(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_member(uuid, text, boolean, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_member_to_leader(uuid, text) FROM authenticated;