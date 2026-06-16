
CREATE TYPE public.payout_method_kind AS ENUM ('bank_transfer', 'neolife_pv');

ALTER TABLE public.profiles
  ADD COLUMN whatsapp_number text,
  ADD COLUMN payout_method public.payout_method_kind NOT NULL DEFAULT 'bank_transfer';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_whatsapp_format
  CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+?[0-9]{7,15}$');
