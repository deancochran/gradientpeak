import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Trash2 } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface TrainingPlanDangerZoneCardProps {
  deletePending: boolean;
  onDelete: () => void;
}

export function TrainingPlanDangerZoneCard({
  deletePending,
  onDelete,
}: TrainingPlanDangerZoneCardProps) {
  return (
    <View className="rounded-xl border border-destructive p-4">
      <Text className="text-base font-semibold text-destructive">Danger Zone</Text>
      <Text className="mt-2 text-sm text-muted-foreground">
        Deleting this training plan will permanently remove its structure and all associated planned
        activities.
      </Text>
      <Button variant="destructive" onPress={onDelete} disabled={deletePending} className="mt-3">
        <Icon as={Trash2} size={18} className="mr-2 text-white" />
        <Text className="font-semibold text-white">
          {deletePending ? "Deleting..." : "Delete Training Plan"}
        </Text>
      </Button>
    </View>
  );
}
