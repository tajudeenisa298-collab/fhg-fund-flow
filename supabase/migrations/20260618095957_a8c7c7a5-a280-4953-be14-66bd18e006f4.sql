-- Guard balance from going negative on debit-type transactions
CREATE OR REPLACE FUNCTION public.apply_transaction_to_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_new_balance numeric;
begin
  if new.type::text in ('deposit','adjustment') then
    update public.profiles set balance_usd = balance_usd + new.amount_usd where id = new.member_id;
  elsif new.type::text in ('withdrawal','release','fund_deduction','bank_fee') then
    update public.profiles
       set balance_usd = balance_usd - new.amount_usd
     where id = new.member_id
    returning balance_usd into v_new_balance;
    if v_new_balance < 0 then
      raise exception 'Insufficient member balance for % of $% (would go to $%). Reverse or reduce the charge.',
        new.type, new.amount_usd, v_new_balance
        using errcode = '23514';
    end if;
  end if;
  return new;
end $function$;