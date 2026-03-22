export function getFormStatus(
  tsb: number,
): "fresh" | "optimal" | "neutral" | "tired" | "overreaching" {
  if (tsb > 25) return "fresh";
  if (tsb > 5) return "optimal";
  if (tsb >= -10) return "neutral";
  if (tsb >= -30) return "tired";
  return "overreaching";
}

export function getFormStatusColor(tsb: number): string {
  const status = getFormStatus(tsb);
  switch (status) {
    case "fresh":
      return "#22c55e";
    case "optimal":
      return "#10b981";
    case "neutral":
      return "#eab308";
    case "tired":
      return "#f97316";
    case "overreaching":
      return "#ef4444";
  }
}
