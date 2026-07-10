import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { View } from "react-native";
import { ActivityCategorySelector } from "@/components/activity-plan/workout/ActivityCategorySelector";

type ActivityPlanBasicsSectionProps = {
  activityCategory: string;
  description: string;
  errors: Record<string, string>;
  name: string;
  onChangeActivityCategory: (category: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeName: (value: string) => void;
};

export function ActivityPlanBasicsSection({
  activityCategory,
  description,
  errors,
  name,
  onChangeActivityCategory,
  onChangeDescription,
  onChangeName,
}: ActivityPlanBasicsSectionProps) {
  return (
    <Card>
      <CardContent className="gap-3 p-3">
        <View className="flex-row gap-3">
          <ActivityCategorySelector
            value={activityCategory}
            onChange={onChangeActivityCategory}
            compact
          />
          <View className="flex-1">
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">Plan name</Text>
              <Input
                accessibilityLabel="Plan name"
                onChangeText={onChangeName}
                placeholder="Plan name"
                value={name}
              />
            </View>
          </View>
        </View>

        {errors.name ? <Text className="text-xs text-destructive">{errors.name}</Text> : null}

        {errors.activity_category ? (
          <Text className="text-xs text-destructive">{errors.activity_category}</Text>
        ) : null}

        <View className="gap-2">
          <Text className="text-sm font-medium text-foreground">Description</Text>
          <Textarea
            accessibilityLabel="Description"
            className="min-h-24"
            onChangeText={(value) => onChangeDescription(value)}
            numberOfLines={4}
            placeholder="What is this session for?"
            value={description}
          />
        </View>
      </CardContent>
    </Card>
  );
}
