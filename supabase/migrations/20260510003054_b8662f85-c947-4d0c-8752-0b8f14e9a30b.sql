create or replace function public.tg_snapshot_txn_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_rate numeric;
begin
  if new.exchange_rate is null then
    select usd_to_ngn into v_rate from public.app_settings where id = 1;
    new.exchange_rate := coalesce(v_rate, 1600);
  end if;
  if new.local_amount is null then
    new.local_amount := round(new.amount_usd * new.exchange_rate, 2);
  end if;
  if new.currency is null or new.currency = '' then
    new.currency := 'NGN';
  end if;
  return new;
end $$;

drop trigger if exists trg_snapshot_txn_rate on public.transactions;
create trigger trg_snapshot_txn_rate
before insert on public.transactions
for each row execute function public.tg_snapshot_txn_rate();