import { Card, CardContent } from "@repo/ui/components/card";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { UseFormReturn } from "react-hook-form";
import { View } from "react-native";
import { ActivityCategorySelector } from "@/components/activity-plan/workout/ActivityCategorySelector";

export type ActivityPlanBasicsFormData = {
  name: string;
  description: string;
};

type ActivityPlanBasicsSectionProps = {
  activityCategory: string;
  activityCategoryError?: string;
  form: UseFormReturn<ActivityPlanBasicsFormData>;
  onChangeActivityCategory: (category: string) => void;
};

export function ActivityPlanBasicsSection({
  activityCategory,
  activityCategoryError,
  form,
  onChangeActivityCategory,
}: ActivityPlanBasicsSectionProps) {
  return (
    <Card>
      <CardContent className="gap-3 p-3">
        <Form {...form}>
          <View className="flex-row gap-3">
            <ActivityCategorySelector
              value={activityCategory}
              onChange={onChangeActivityCategory}
              compact
            />
            <View className="flex-1">
              <FormTextField
                control={form.control}
                label="Plan name"
                name="name"
                placeholder="Plan name"
                required
              />
            </View>
          </View>

          {activityCategoryError ? (
            <Text className="text-xs text-destructive">{activityCategoryError}</Text>
          ) : null}

          <FormTextareaField
            className="min-h-24"
            control={form.control}
            label="Description"
            name="description"
            numberOfLines={4}
            placeholder="What is this session for?"
          />
        </Form>
      </CardContent>
    </Card>
  );
}
