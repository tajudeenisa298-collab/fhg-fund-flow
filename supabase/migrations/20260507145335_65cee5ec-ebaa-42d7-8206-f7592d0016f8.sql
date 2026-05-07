
-- Transaction type
create type public.txn_type as enum ('deposit', 'withdrawal', 'release', 'adjustment');
create type public.withdrawal_status as enum ('pending', 'approved', 'declined');

-- Withdrawal requests
create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  description text not null,
  status public.withdrawal_status not null default 'pending',
  leader_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.withdrawal_requests(member_id);
create index on public.withdrawal_requests(leader_id);
create index on public.withdrawal_requests(status);

-- Transactions ledger
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  leader_id uuid references public.profiles(id) on delete set null,
  type public.txn_type not null,
  amount_usd numeric(14,2) not null,
  currency text not null default 'USD',
  local_amount numeric(16,2),
  exchange_rate numeric(14,4),
  note text,
  request_id uuid references public.withdrawal_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.transactions(member_id);
create index on public.transactions(leader_id);

-- Auto-adjust profile balance on transaction insert
create or replace function public.apply_transaction_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'deposit' or new.type = 'adjustment' then
    update public.profiles set balance_usd = balance_usd + new.amount_usd where id = new.member_id;
  elsif new.type = 'withdrawal' or new.type = 'release' then
    update public.profiles set balance_usd = balance_usd - new.amount_usd where id = new.member_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.apply_transaction_to_balance() from public, anon, authenticated;

create trigger transactions_apply_balance
  after insert on public.transactions
  for each row execute function public.apply_transaction_to_balance();

-- Promote a member to leader (releases their balance + adds leader role)
create or replace function public.promote_member_to_leader(_member_id uuid, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
begin
  select * into v_member from public.profiles where id = _member_id;
  if v_member is null then
    raise exception 'Member not found';
  end if;
  if v_member.leader_id is null or v_member.leader_id <> auth.uid() then
    raise exception 'Only the member''s current leader can promote them';
  end if;
  if not public.has_role(auth.uid(), 'leader') then
    raise exception 'Only leaders can promote members';
  end if;

  -- Release any held balance
  if v_member.balance_usd > 0 then
    insert into public.transactions (member_id, leader_id, type, amount_usd, note)
      values (_member_id, auth.uid(), 'release', v_member.balance_usd,
              coalesce(_note, 'Funds released on promotion to Team Leader'));
  end if;

  -- Update profile: bump rank, detach from upline so they manage themselves
  update public.profiles
    set rank = 'Director', leader_id = null
    where id = _member_id;

  -- Grant leader role (keep member role too so prior history still resolves)
  insert into public.user_roles (user_id, role)
    values (_member_id, 'leader')
    on conflict (user_id, role) do nothing;
end;
$$;
revoke execute on function public.promote_member_to_leader(uuid, text) from public, anon;
grant execute on function public.promote_member_to_leader(uuid, text) to authenticated;

-- RLS
alter table public.withdrawal_requests enable row level security;
alter table public.transactions enable row level security;

-- withdrawal_requests
create policy "members view own requests" on public.withdrawal_requests
  for select to authenticated using (member_id = auth.uid());
create policy "leaders view team requests" on public.withdrawal_requests
  for select to authenticated using (leader_id = auth.uid());
create policy "members create own requests" on public.withdrawal_requests
  for insert to authenticated
  with check (member_id = auth.uid() and status = 'pending'
              and leader_id = (select leader_id from public.profiles where id = auth.uid()));
create policy "leaders update team requests" on public.withdrawal_requests
  for update to authenticated using (leader_id = auth.uid()) with check (leader_id = auth.uid());

-- transactions
create policy "members view own transactions" on public.transactions
  for select to authenticated using (member_id = auth.uid());
create policy "leaders view team transactions" on public.transactions
  for select to authenticated using (leader_id = auth.uid());
create policy "leaders create team transactions" on public.transactions
  for insert to authenticated
  with check (leader_id = auth.uid()
              and public.has_role(auth.uid(), 'leader')
              and exists (select 1 from public.profiles p where p.id = member_id and p.leader_id = auth.uid()));
