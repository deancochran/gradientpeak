import { View } from "react-native";

import { Button } from "../button/index.native";
import { Card, CardContent, CardHeader, CardTitle } from "../card/index.native";
import { Text } from "../text/index.native";
import type { TrainingPreferencesSummaryCardProps } from "./shared";

function TrainingPreferencesSummaryCard({
  actionLabel = "Open Preferences",
  items,
  onActionPress,
  title = "Training Preferences",
}: TrainingPreferencesSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {items.map((item) => (
          <View key={item.label} className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <Text className="text-xs text-muted-foreground">{item.label}</Text>
            <Text className="text-sm font-medium text-foreground">{item.value}</Text>
          </View>
        ))}
        <Button variant="outline" onPress={onActionPress}>
          <Text>{actionLabel}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}

export type {
  TrainingPreferenceSummaryItem,
  TrainingPreferencesSummaryCardProps,
} from "./shared";
export { TrainingPreferencesSummaryCard };
