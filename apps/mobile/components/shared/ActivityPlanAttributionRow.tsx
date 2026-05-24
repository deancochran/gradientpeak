import type { ReactNode } from "react";
import type { EntityOwner } from "./EntityOwnerRow";
import { ResourceAttributionRow } from "./ResourceCardPrimitives";

interface ActivityPlanAttributionRowProps {
  compact?: boolean;
  endAccessory?: ReactNode;
  fallbackLabel?: string;
  onOwnerPress?: () => void;
  owner?: EntityOwner | null;
  updatedAt?: string | Date | null;
}

export function ActivityPlanAttributionRow({
  compact = false,
  endAccessory,
  fallbackLabel = "System Template",
  onOwnerPress,
  owner,
  updatedAt,
}: ActivityPlanAttributionRowProps) {
  return (
    <ResourceAttributionRow
      compact={compact}
      endAccessory={endAccessory}
      fallbackLabel={fallbackLabel}
      onOwnerPress={onOwnerPress}
      owner={owner}
      testID="activity-plan-attribution-row"
      timestamp={updatedAt}
    />
  );
}
