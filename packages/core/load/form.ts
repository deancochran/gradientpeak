export type LoadBalanceStatus =
  | "high_positive_balance"
  | "positive_balance"
  | "near_balance"
  | "negative_balance"
  | "high_negative_balance";

/** Describes the arithmetic balance between longer- and shorter-term load histories. */
export function getLoadBalanceStatus(loadBalance: number): LoadBalanceStatus {
  if (loadBalance > 25) return "high_positive_balance";
  if (loadBalance > 5) return "positive_balance";
  if (loadBalance >= -10) return "near_balance";
  if (loadBalance >= -30) return "negative_balance";
  return "high_negative_balance";
}
