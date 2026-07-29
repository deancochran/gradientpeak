import { AccessibilityInfo } from "react-native";

/** Announces explicitly initiated retry progress without coupling presentation to the native API. */
export function announcePlannedDaySummaryRetryStatus(message: string) {
  AccessibilityInfo?.announceForAccessibility?.(message);
}
