export const ALERT_VARIANTS = ["default", "destructive"] as const;

export type AlertVariant = (typeof ALERT_VARIANTS)[number];
