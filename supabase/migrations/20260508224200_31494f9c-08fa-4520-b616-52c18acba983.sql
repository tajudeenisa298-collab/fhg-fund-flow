
-- 1. App settings (single row keyed id=1) for USD→NGN rate
create table public.app_settings (
  id int primary key default 1,
  usd_to_ngn numeric not null default 1600,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.app_settings (id) values (1);
alter table public.app_settings enable row level security;
create policy "anyone authed reads settings" on public.app_settings for select to authenticated using (true);
create policy "leaders update settings" on public.app_settings for update to authenticated
  using (public.has_role(auth.uid(), 'leader')) with check (public.has_role(auth.uid(), 'leader'));

-- 2. Profiles: can_handle_funds + constrain rank to 18 stages
alter table public.profiles add column if not exists can_handle_funds boolean not null default false;

-- Normalise existing rank values to canonical names
update public.profiles set rank = 'Member' where rank = 'New Member';
alter table public.profiles alter column rank set default 'Member';

-- Validation trigger for rank (avoid CHECK constraint per guidelines)
create or replace function public.validate_profile_rank()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.rank not in (
    'Member','Distributor','Manager','Senior Manager','Executive Manager',
    'Director','Emerald Director','Sapphire Director',
    '1 Ruby Director','2 Ruby Director','3 Ruby Director','4 Ruby Director','5 Ruby Director',
    '1 Diamond Director','2 Diamond Director','3 Diamond Director','4 Diamond Director','5 Diamond Director'
  ) then
    raise exception 'Invalid rank: %', new.rank;
  end if;
  return new;
end $$;
create trigger profiles_validate_rank
  before insert or update of rank on public.profiles
  for each row execute function public.validate_profile_rank();

-- 3. Invite codes — 20-minute expiry
alter table public.invite_codes add column if not exists expires_at timestamptz not null default (now() + interval '20 minutes');

create or replace function public.validate_invite_code(_code text)
returns table(leader_id uuid, leader_name text)
language sql stable security definer set search_path = public as $$
  select ic.leader_id, p.full_name
  from public.invite_codes ic
  join public.profiles p on p.id = ic.leader_id
  where ic.code = _code
    and ic.used_by is null
    and ic.revoked = false
    and ic.expires_at > now()
  limit 1;
$$;

-- Update handle_new_user to also reject expired codes
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_invite_code text := nullif(new.raw_user_meta_data->>'invite_code', '');
  v_leader_id uuid := null;
  v_role public.app_role := 'leader';
  v_invite_id uuid := null;
  v_initial_rank text := 'Director';
  v_invite record;
begin
  if v_invite_code is not null then
    select * into v_invite from public.invite_codes
      where code = v_invite_code and used_by is null and revoked = false and expires_at > now()
      limit 1;
    if not found then raise exception 'Invalid or expired invite code'; end if;
    v_leader_id := v_invite.leader_id;
    v_role := 'member';
    v_invite_id := v_invite.id;
    v_initial_rank := 'Member';
  end if;

  insert into public.profiles (id, full_name, email, leader_id, rank, can_handle_funds)
    values (new.id, v_full_name, new.email, v_leader_id, v_initial_rank,
            case when v_role = 'leader' then true else false end);

  insert into public.user_roles (user_id, role) values (new.id, v_role);

  if v_invite_id is not null then
    update public.invite_codes set used_by = new.id, used_at = now() where id = v_invite_id;
  end if;
  return new;
end $$;

-- 4. Generic promote_member (replaces promote_member_to_leader)
create or replace function public.promote_member(
  _member_id uuid,
  _new_rank text,
  _grant_fund_handler boolean default false,
  _note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_member record;
  v_director_ranks text[] := array['Director','Emerald Director','Sapphire Director',
    '1 Ruby Director','2 Ruby Director','3 Ruby Director','4 Ruby Director','5 Ruby Director',
    '1 Diamond Director','2 Diamond Director','3 Diamond Director','4 Diamond Director','5 Diamond Director'];
  v_is_director boolean;
begin
  select * into v_member from public.profiles where id = _member_id;
  if v_member is null then raise exception 'Member not found'; end if;
  if v_member.leader_id is null or v_member.leader_id <> auth.uid() then
    raise exception 'Only the member''s current leader can promote them';
  end if;
  if not public.has_role(auth.uid(), 'leader') then
    raise exception 'Only leaders can promote members';
  end if;

  v_is_director := _new_rank = any(v_director_ranks);

  -- If becoming a Director (or above), release held funds and detach from upline
  if v_is_director and v_member.balance_usd > 0 then
    insert into public.transactions (member_id, leader_id, type, amount_usd, note)
      values (_member_id, auth.uid(), 'release', v_member.balance_usd,
              coalesce(_note, 'Funds released on promotion to ' || _new_rank));
  end if;

  update public.profiles
    set rank = _new_rank,
        leader_id = case when v_is_director then null else leader_id end,
        can_handle_funds = case when v_is_director or _grant_fund_handler then true else can_handle_funds end
    where id = _member_id;

  if v_is_director or _grant_fund_handler then
    insert into public.user_roles (user_id, role)
      values (_member_id, 'leader')
      on conflict (user_id, role) do nothing;
  end if;
end $$;

-- 5. Upkeep plans
create type public.upkeep_frequency as enum ('every_3_days','weekly','biweekly','monthly','custom_days');

create table public.upkeep_plans (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null,
  member_id uuid not null,
  amount_usd numeric not null check (amount_usd > 0),
  frequency public.upkeep_frequency not null,
  custom_days int,
  next_run_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.upkeep_plans (leader_id);
create index on public.upkeep_plans (next_run_at) where active;
create trigger upkeep_plans_touch before update on public.upkeep_plans
  for each row execute function public.touch_updated_at();

alter table public.upkeep_plans enable row level security;
create policy "leaders manage own plans" on public.upkeep_plans for all to authenticated
  using (leader_id = auth.uid()) with check (leader_id = auth.uid() and public.has_role(auth.uid(),'leader'));
create policy "members view own plans" on public.upkeep_plans for select to authenticated
  using (member_id = auth.uid());

-- Hook: process due upkeep plans
create or replace function public.run_due_upkeep()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_plan record;
  v_count int := 0;
  v_next timestamptz;
begin
  for v_plan in
    select * from public.upkeep_plans
    where active = true and next_run_at <= now()
    for update skip locked
  loop
    insert into public.transactions (member_id, leader_id, type, amount_usd, note)
      values (v_plan.member_id, v_plan.leader_id, 'deposit', v_plan.amount_usd, 'Upkeep stipend');

    v_next := case v_plan.frequency
      when 'every_3_days' then v_plan.next_run_at + interval '3 days'
      when 'weekly' then v_plan.next_run_at + interval '7 days'
      when 'biweekly' then v_plan.next_run_at + interval '14 days'
      when 'monthly' then v_plan.next_run_at + interval '1 month'
      when 'custom_days' then v_plan.next_run_at + (coalesce(v_plan.custom_days,7) || ' days')::interval
    end;
    update public.upkeep_plans set next_run_at = v_next where id = v_plan.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 6. Bank accounts
create table public.bank_accounts (
  user_id uuid primary key,
  bank_name text not null,
  account_number text not null,
  account_owner_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger bank_accounts_touch before update on public.bank_accounts
  for each row execute function public.touch_updated_at();
alter table public.bank_accounts enable row level security;
create policy "users view own bank" on public.bank_accounts for select to authenticated using (user_id = auth.uid());
create policy "users insert own bank" on public.bank_accounts for insert to authenticated with check (user_id = auth.uid());
create policy "users update own bank" on public.bank_accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Leaders can also see their direct downline's bank info (for payout reference)
create policy "leaders view downline bank" on public.bank_accounts for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = bank_accounts.user_id and p.leader_id = auth.uid()));
