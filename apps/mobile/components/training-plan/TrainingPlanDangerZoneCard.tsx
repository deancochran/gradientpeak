import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Trash2 } from "lucide-react-native";
import React from "react";

interface TrainingPlanDangerZoneCardProps {
  deletePending: boolean;
  onDelete: () => void;
}

export function TrainingPlanDangerZoneCard({
  deletePending,
  onDelete,
}: TrainingPlanDangerZoneCardProps) {
  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
      </CardHeader>
      <CardContent>
        <React.Fragment>
          <Text className="text-sm text-muted-foreground">
            Deleting this training plan will permanently remove its structure and all associated
            planned activities.
          </Text>
          <Button
            variant="destructive"
            onPress={onDelete}
            disabled={deletePending}
            className="mt-3"
          >
            <Icon as={Trash2} size={18} className="text-white mr-2" />
            <Text className="text-white font-semibold">
              {deletePending ? "Deleting..." : "Delete Training Plan"}
            </Text>
          </Button>
        </React.Fragment>
      </CardContent>
    </Card>
  );
}
