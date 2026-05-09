
-- ===== NOTIFICATIONS =====
create type public.notification_kind as enum (
  'request_new','request_resolved','deposit','fund_deduction',
  'bank_updated','upkeep','generic'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text,
  kind public.notification_kind not null default 'generic',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
create policy "users see own notifs" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users update own notifs" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.notifications;

create or replace function public.notify_user(_user_id uuid,_title text,_body text,_kind public.notification_kind,_link text default null)
returns void language sql security definer set search_path=public as $$
  insert into public.notifications (user_id,title,body,kind,link) values (_user_id,_title,_body,_kind,_link);
$$;

create or replace function public.tg_notify_request_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
  select full_name into v_name from public.profiles where id = new.member_id;
  perform public.notify_user(new.leader_id,'New withdrawal request',
    coalesce(v_name,'Member')||' requested $'||new.amount_usd,'request_new','/dashboard');
  return new;
end $$;
create trigger trg_notify_request_insert after insert on public.withdrawal_requests
  for each row execute function public.tg_notify_request_insert();

create or replace function public.tg_notify_request_resolved()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status <> old.status and new.status in ('approved','declined') then
    perform public.notify_user(new.member_id,'Withdrawal '||new.status,
      'Your $'||new.amount_usd||' request was '||new.status,'request_resolved','/dashboard');
  end if;
  return new;
end $$;
create trigger trg_notify_request_resolved after update on public.withdrawal_requests
  for each row execute function public.tg_notify_request_resolved();

create or replace function public.tg_notify_txn_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_kind public.notification_kind; v_title text;
begin
  if new.type::text='deposit' then v_kind:='deposit'; v_title:='Deposit added';
  elsif new.type::text='fund_deduction' then v_kind:='fund_deduction'; v_title:='Fund deduction';
  elsif new.type::text='release' then v_kind:='generic'; v_title:='Funds released';
  elsif new.type::text='withdrawal' then v_kind:='generic'; v_title:='Withdrawal recorded';
  else v_kind:='generic'; v_title:='Balance adjustment';
  end if;
  perform public.notify_user(new.member_id,v_title,coalesce(new.note,'$'||new.amount_usd),v_kind,'/dashboard');
  return new;
end $$;
create trigger trg_notify_txn_insert after insert on public.transactions
  for each row execute function public.tg_notify_txn_insert();

create or replace function public.tg_notify_bank_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_leader uuid;
begin
  perform public.notify_user(new.user_id,'Bank details saved',
    new.bank_name||' · '||new.account_number,'bank_updated','/settings');
  select leader_id into v_leader from public.profiles where id = new.user_id;
  if v_leader is not null then
    perform public.notify_user(v_leader,'Member updated bank details',
      (select full_name from public.profiles where id=new.user_id),'bank_updated','/dashboard');
  end if;
  return new;
end $$;
create trigger trg_notify_bank_insert after insert on public.bank_accounts
  for each row execute function public.tg_notify_bank_change();
create trigger trg_notify_bank_update after update on public.bank_accounts
  for each row execute function public.tg_notify_bank_change();

-- ===== FUND RULES =====
create type public.fund_kind as enum ('per_usd','fixed');
create type public.fund_frequency as enum ('one_time','weekly','biweekly','monthly','custom_days');

create table public.fund_rules (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null,
  name text not null,
  kind public.fund_kind not null,
  amount_ngn numeric not null check (amount_ngn >= 0),
  frequency public.fund_frequency,
  custom_days int,
  active boolean not null default true,
  description text,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fund_rules_leader_idx on public.fund_rules (leader_id);

alter table public.fund_rules enable row level security;
create policy "leaders manage own rules" on public.fund_rules for all to authenticated
  using (leader_id = auth.uid()) with check (leader_id = auth.uid() and has_role(auth.uid(),'leader'));
create policy "members view leader rules" on public.fund_rules for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.leader_id=fund_rules.leader_id));

create trigger trg_fund_rules_touch before update on public.fund_rules
  for each row execute function public.touch_updated_at();

-- balance trigger update for fund_deduction
create or replace function public.apply_transaction_to_balance()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.type::text in ('deposit','adjustment') then
    update public.profiles set balance_usd = balance_usd + new.amount_usd where id = new.member_id;
  elsif new.type::text in ('withdrawal','release','fund_deduction') then
    update public.profiles set balance_usd = balance_usd - new.amount_usd where id = new.member_id;
  end if;
  return new;
end $$;

-- auto-apply per_usd rules when a deposit lands
create or replace function public.tg_apply_per_usd_rules()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; v_rate numeric; v_ded_usd numeric;
begin
  if new.type::text <> 'deposit' or new.leader_id is null then return new; end if;
  select usd_to_ngn into v_rate from public.app_settings where id=1;
  if v_rate is null or v_rate <= 0 then return new; end if;

  for r in select * from public.fund_rules
           where leader_id = new.leader_id and active = true and kind = 'per_usd'
  loop
    -- amount_ngn is "NGN per $1"; deduction NGN = amount_ngn * usd_amount; convert back to USD
    v_ded_usd := round((r.amount_ngn * new.amount_usd) / v_rate, 2);
    if v_ded_usd > 0 then
      insert into public.transactions (member_id, leader_id, type, amount_usd, note)
        values (new.member_id, new.leader_id, 'fund_deduction', v_ded_usd, r.name);
    end if;
  end loop;
  return new;
end $$;
create trigger trg_apply_per_usd_rules after insert on public.transactions
  for each row execute function public.tg_apply_per_usd_rules();

-- recurring rules processor
create or replace function public.run_due_fund_rules()
returns int language plpgsql security definer set search_path=public as $$
declare r record; m record; cnt int := 0; v_rate numeric; v_ded_usd numeric; v_next timestamptz;
begin
  select usd_to_ngn into v_rate from public.app_settings where id=1;
  if v_rate is null or v_rate <= 0 then v_rate := 1600; end if;

  for r in select * from public.fund_rules
           where active = true and kind = 'fixed'
             and frequency is not null
             and next_run_at is not null and next_run_at <= now()
           for update skip locked
  loop
    v_ded_usd := round(r.amount_ngn / v_rate, 2);
    for m in select id from public.profiles where leader_id = r.leader_id loop
      insert into public.transactions (member_id, leader_id, type, amount_usd, note)
        values (m.id, r.leader_id, 'fund_deduction', v_ded_usd, r.name);
      cnt := cnt + 1;
    end loop;
    v_next := case r.frequency
      when 'weekly' then r.next_run_at + interval '7 days'
      when 'biweekly' then r.next_run_at + interval '14 days'
      when 'monthly' then r.next_run_at + interval '1 month'
      when 'custom_days' then r.next_run_at + (coalesce(r.custom_days,7)||' days')::interval
      when 'one_time' then null
    end;
    update public.fund_rules
      set next_run_at = v_next, active = case when r.frequency='one_time' then false else active end
      where id = r.id;
  end loop;
  return cnt;
end $$;
