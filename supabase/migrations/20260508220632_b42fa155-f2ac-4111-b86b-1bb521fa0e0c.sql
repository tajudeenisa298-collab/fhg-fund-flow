CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_invite_code text := nullif(new.raw_user_meta_data->>'invite_code', '');
  v_leader_id uuid := null;
  v_role public.app_role := 'leader';
  v_invite_id uuid := null;
  v_invite record;
begin
  if v_invite_code is not null then
    select * into v_invite from public.invite_codes
      where code = v_invite_code and used_by is null and revoked = false
      limit 1;
    if not found then
      raise exception 'Invalid or already used invite code';
    end if;
    v_leader_id := v_invite.leader_id;
    v_role := 'member';
    v_invite_id := v_invite.id;
  end if;

  insert into public.profiles (id, full_name, email, leader_id)
    values (new.id, v_full_name, new.email, v_leader_id);

  insert into public.user_roles (user_id, role) values (new.id, v_role);

  if v_invite_id is not null then
    update public.invite_codes set used_by = new.id, used_at = now() where id = v_invite_id;
  end if;

  return new;
end;
$function$;