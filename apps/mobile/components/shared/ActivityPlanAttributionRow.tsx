import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import React from "react";
import { View } from "react-native";
import { type EntityOwner, EntityOwnerRow } from "./EntityOwnerRow";

interface ActivityPlanAttributionRowProps {
  compact?: boolean;
  owner?: EntityOwner | null;
  updatedAt?: string | Date | null;
}

function formatUpdatedAt(updatedAt?: string | Date | null) {
  if (!updatedAt) return null;

  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;

  return `Updated ${format(date, "MMM d, yyyy")}`;
}

export function ActivityPlanAttributionRow({
  compact = false,
  owner,
  updatedAt,
}: ActivityPlanAttributionRowProps) {
  const updatedLabel = formatUpdatedAt(updatedAt);

  if (!owner && !updatedLabel) {
    return null;
  }

  return (
    <View
      className="mt-3 flex-row items-end justify-between gap-3"
      testID="activity-plan-attribution-row"
    >
      <View className="min-w-0 flex-1">
        {owner ? (
          <EntityOwnerRow compact={compact} minimal owner={owner} />
        ) : (
          <Text
            className={
              compact
                ? "text-xs font-medium text-muted-foreground"
                : "text-sm font-medium text-muted-foreground"
            }
            numberOfLines={1}
          >
            System Template
          </Text>
        )}
      </View>
      {updatedLabel ? (
        <Text className="shrink-0 text-[10px] text-muted-foreground" numberOfLines={1}>
          {updatedLabel}
        </Text>
      ) : null}
    </View>
  );
}
