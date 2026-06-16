-- Add new notification kinds
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'fund_rule_changed';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'fx_rate_changed';