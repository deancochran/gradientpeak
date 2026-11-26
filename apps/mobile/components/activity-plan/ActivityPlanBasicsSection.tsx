import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { UseFormReturn } from "react-hook-form";
import { View } from "react-native";
import { ActivityCategorySelector } from "@/components/activity-plan/activity/ActivityCategorySelector";

export type ActivityPlanBasicsFormData = {
  readonly __activityPlanBasicsForm?: never;
  name: string;
  description: string;
};

type ActivityPlanBasicsSectionProps = {
  activityCategory: string;
  activityCategoryError?: string;
  form: UseFormReturn<ActivityPlanBasicsFormData>;
  onChangeActivityCategory: (activity_category: string) => void;
  disabled?: boolean;
};

export function ActivityPlanBasicsSection({
  activityCategory,
  activityCategoryError,
  form,
  onChangeActivityCategory,
  disabled = false,
}: ActivityPlanBasicsSectionProps) {
  return (
    <Form {...form}>
      <View className="gap-3">
        <View className="flex-row flex-wrap items-end gap-3" testID="activity-plan-name-row">
          <View className="min-w-0 flex-1">
            <FormTextField
              disabled={disabled}
              control={form.control}
              label="Plan name"
              name="name"
              placeholder="Plan name"
              required
            />
          </View>
          <ActivityCategorySelector
            disabled={disabled}
            value={activityCategory}
            onChange={onChangeActivityCategory}
            compact
            accessibilityLabel="Plan activity category"
            accessibilityHint="Changes the activity category for this activity plan"
          />
        </View>
        {activityCategoryError ? (
          <Text accessibilityRole="alert" className="text-xs text-destructive">
            {activityCategoryError}
          </Text>
        ) : null}
        <FormTextareaField
          disabled={disabled}
          className="min-h-12"
          control={form.control}
          label="Description"
          maxLength={3000}
          name="description"
          numberOfLines={2}
          placeholder="What is this session for?"
        />
      </View>
    </Form>
  );
}
