
-- Extend txn_type enum with new categories: bank fees, office ledger, leader purse
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'bank_fee';
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'office_credit';
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'office_expense';
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'leader_credit';
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'leader_debit';

-- Notification kind for office events
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'office';

-- Gender enum
DO $$ BEGIN
  CREATE TYPE public.gender_kind AS ENUM ('male','female','other','prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
