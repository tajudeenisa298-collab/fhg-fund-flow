
alter table public.bank_accounts
  add column if not exists bank_code text,
  add column if not exists verified_at timestamptz;

create table if not exists public.paystack_banks (
  code text primary key,
  name text not null,
  slug text,
  active boolean not null default true,
  fetched_at timestamptz not null default now()
);

alter table public.paystack_banks enable row level security;

drop policy if exists "anyone authed reads banks" on public.paystack_banks;
create policy "anyone authed reads banks"
  on public.paystack_banks for select to authenticated
  using (true);
