export type LoadBalanceStatus =
  | "high_positive_balance"
  | "positive_balance"
  | "near_balance"
  | "negative_balance"
  | "high_negative_balance";

/** Describes the arithmetic balance between longer- and shorter-term load histories. */
export function getLoadBalanceStatus(tsb: number): LoadBalanceStatus {
  if (tsb > 25) return "high_positive_balance";
  if (tsb > 5) return "positive_balance";
  if (tsb >= -10) return "near_balance";
  if (tsb >= -30) return "negative_balance";
  return "high_negative_balance";
}
