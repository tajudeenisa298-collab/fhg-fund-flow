export interface Transaction {
  id: string;
  member_id: string;
  leader_id: string | null;
  type: "deposit" | "withdrawal" | "release" | "adjustment";
  amount_usd: number;
  currency: string;
  local_amount: number | null;
  exchange_rate: number | null;
  note: string | null;
  request_id: string | null;
  created_at: string;
}

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
  account_number: string;
  account_owner_name: string;
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
