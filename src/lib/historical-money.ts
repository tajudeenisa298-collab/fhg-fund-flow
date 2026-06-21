import type { Transaction } from "@/lib/types";

const CREDIT_TYPES = new Set(["deposit", "adjustment", "office_credit", "leader_credit"]);
const DEBIT_TYPES = new Set([
  "withdrawal",
  "release",
  "fund_deduction",
  "bank_fee",
  "office_expense",
  "leader_debit",
]);

export function transactionSign(type: Transaction["type"]) {
  if (CREDIT_TYPES.has(type)) return 1;
  if (DEBIT_TYPES.has(type)) return -1;
  return 0;
}

export function localAmountForTransaction(txn: Transaction, fallbackRate?: number) {
  if (txn.local_amount !== null && txn.local_amount !== undefined) {
    return Number(txn.local_amount) || 0;
  }
  const rate = Number(txn.exchange_rate ?? fallbackRate ?? 0);
  return rate > 0 ? (Number(txn.amount_usd) || 0) * rate : 0;
}

export function historicalLocalBalance(txns: Transaction[], fallbackRate?: number) {
  return txns.reduce(
    (sum, txn) => sum + transactionSign(txn.type) * localAmountForTransaction(txn, fallbackRate),
    0,
  );
}

export function historicalLocalBalancesByMember(txns: Transaction[], fallbackRate?: number) {
  const balances = new Map<string, number>();
  for (const txn of txns) {
    balances.set(
      txn.member_id,
      (balances.get(txn.member_id) ?? 0) +
        transactionSign(txn.type) * localAmountForTransaction(txn, fallbackRate),
    );
  }
  return balances;
}
