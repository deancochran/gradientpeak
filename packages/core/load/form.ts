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

/**
 * @deprecated Use getLoadBalanceStatus. These legacy labels do not represent
 * measured readiness, fatigue, optimality, or overreaching.
 */
export function getFormStatus(
  tsb: number,
): "fresh" | "optimal" | "neutral" | "tired" | "overreaching" {
  const status = getLoadBalanceStatus(tsb);
  const legacyStatusByBalance: Record<
    LoadBalanceStatus,
    "fresh" | "optimal" | "neutral" | "tired" | "overreaching"
  > = {
    high_positive_balance: "fresh",
    positive_balance: "optimal",
    near_balance: "neutral",
    negative_balance: "tired",
    high_negative_balance: "overreaching",
  };
  return legacyStatusByBalance[status];
}

export function getFormStatusColor(tsb: number): string {
  const status = getLoadBalanceStatus(tsb);
  switch (status) {
    case "high_positive_balance":
      return "#22c55e";
    case "positive_balance":
      return "#10b981";
    case "near_balance":
      return "#eab308";
    case "negative_balance":
      return "#f97316";
    case "high_negative_balance":
      return "#ef4444";
  }
}
