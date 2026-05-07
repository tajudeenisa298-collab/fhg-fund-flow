
-- Roles enum and table
create type public.app_role as enum ('member', 'leader');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  leader_id uuid references public.profiles(id) on delete set null,
  rank text not null default 'New Member',
  balance_usd numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.profiles(leader_id);
create index on public.invite_codes(leader_id);

-- has_role helper (security definer to avoid RLS recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Trigger to auto-create profile + assign role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_invite_code text := nullif(new.raw_user_meta_data->>'invite_code', '');
  v_leader_id uuid;
  v_role public.app_role;
  v_invite record;
begin
  if v_invite_code is not null then
    select * into v_invite from public.invite_codes
      where code = v_invite_code and used_by is null and revoked = false
      limit 1;
    if v_invite.id is null then
      raise exception 'Invalid or already used invite code';
    end if;
    v_leader_id := v_invite.leader_id;
    v_role := 'member';
  else
    -- No invite code => signing up as a leader (Director)
    v_leader_id := null;
    v_role := 'leader';
  end if;

  insert into public.profiles (id, full_name, email, leader_id)
    values (new.id, v_full_name, new.email, v_leader_id);

  insert into public.user_roles (user_id, role) values (new.id, v_role);

  if v_invite.id is not null then
    update public.invite_codes set used_by = new.id, used_at = now() where id = v_invite.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Public RPC to validate an invite code at signup time (used unauthenticated)
create or replace function public.validate_invite_code(_code text)
returns table (leader_id uuid, leader_name text)
language sql
stable
security definer
set search_path = public
as $$
  select ic.leader_id, p.full_name
  from public.invite_codes ic
  join public.profiles p on p.id = ic.leader_id
  where ic.code = _code and ic.used_by is null and ic.revoked = false
  limit 1;
$$;

grant execute on function public.validate_invite_code(text) to anon, authenticated;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.invite_codes enable row level security;

-- profiles policies
create policy "users view own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "leaders view downline profiles" on public.profiles
  for select to authenticated using (leader_id = auth.uid());

create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- user_roles policies
create policy "users view own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

-- invite_codes policies
create policy "leaders view own codes" on public.invite_codes
  for select to authenticated using (leader_id = auth.uid());

create policy "leaders create own codes" on public.invite_codes
  for insert to authenticated with check (leader_id = auth.uid() and public.has_role(auth.uid(), 'leader'));

create policy "leaders revoke own codes" on public.invite_codes
  for update to authenticated using (leader_id = auth.uid()) with check (leader_id = auth.uid());
