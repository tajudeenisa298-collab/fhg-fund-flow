export type TxnType =
  | "deposit"
  | "withdrawal"
  | "release"
  | "adjustment"
  | "fund_deduction"
  | "bank_fee"
  | "office_credit"
  | "office_expense"
  | "leader_credit"
  | "leader_debit";

export interface Transaction {
  id: string;
  member_id: string;
  leader_id: string | null;
  type: TxnType;
  amount_usd: number;
  currency: string;
  local_amount: number | null;
  exchange_rate: number | null;
  note: string | null;
  request_id: string | null;
  parent_txn_id: string | null;
  created_at: string;
}

export interface OfficeLedgerEntry {
  id: string;
  leader_id: string;
  kind: "support_in" | "expense_out";
  amount_ngn: number;
  category: string | null;
  note: string | null;
  source_txn_id: string | null;
  created_at: string;
}

export interface LeaderPurseEntry {
  id: string;
  leader_id: string;
  kind: "credit" | "debit";
  amount_usd: number;
  note: string | null;
  created_at: string;
}

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";
export const GENDER_LABEL: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

export type FxRates = Record<string, number>;
export const SUPPORTED_CURRENCIES = ["USD", "NGN", "GBP", "EUR"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export interface WithdrawalRequest {
  id: string;
  member_id: string;
  leader_id: string;
  amount_usd: number;
  description: string;
  status: "pending" | "approved" | "declined";
  leader_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type UpkeepFrequency =
  | "every_3_days"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "custom_days";

export interface UpkeepPlan {
  id: string;
  leader_id: string;
  member_id: string;
  amount_usd: number;
  frequency: UpkeepFrequency;
  custom_days: number | null;
  next_run_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  user_id: string;
  bank_name: string;
  bank_code: string | null;
  account_number: string;
  account_owner_name: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export const FREQ_LABEL: Record<UpkeepFrequency, string> = {
  every_3_days: "Every 3 days",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  custom_days: "Custom",
};

export type FundKind = "per_usd" | "fixed";
export type FundFrequency = "one_time" | "weekly" | "biweekly" | "monthly" | "custom_days";
export type FundDestination = "office_support" | "team_leader" | "custom" | "member_upkeep";

export interface FundRule {
  id: string;
  leader_id: string;
  name: string;
  kind: FundKind;
  destination: FundDestination;
  target_rank: string | null;
  amount_ngn: number;
  frequency: FundFrequency | null;
  custom_days: number | null;
  active: boolean;
  description: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export const FUND_FREQ_LABEL: Record<FundFrequency, string> = {
  one_time: "One-time",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  custom_days: "Every N days",
};

export type NotificationKind =
  | "request_new"
  | "request_resolved"
  | "deposit"
  | "fund_deduction"
  | "bank_updated"
  | "upkeep"
  | "generic";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  kind: NotificationKind;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
