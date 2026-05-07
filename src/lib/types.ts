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
