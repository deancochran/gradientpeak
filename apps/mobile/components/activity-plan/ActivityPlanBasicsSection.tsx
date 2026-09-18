import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Pressable, View } from "react-native";
import { ActivityCategorySelector } from "@/components/activity-plan/activity/ActivityCategorySelector";
import { getActivityCategoryConfig } from "@/lib/constants/activities";

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activityConfig = getActivityCategoryConfig(activityCategory);
  return (
    <Form {...form}>
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className={`rounded-full p-2.5 ${activityConfig.bgColor}`}>
            <Icon as={activityConfig.icon} size={18} className={activityConfig.color} />
          </View>
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
            accessibilityHint="Sets the activity category for this activity plan"
          />
        </View>

        {activityCategoryError ? (
          <Text accessibilityRole="alert" className="text-xs text-destructive">
            {activityCategoryError}
          </Text>
        ) : null}

        <Pressable
          disabled={disabled}
          accessibilityHint="Expands the description field"
          accessibilityLabel={detailsOpen ? "Hide description" : "Edit description"}
          accessibilityRole="button"
          className="min-h-11 justify-center rounded-md px-1"
          onPress={() => setDetailsOpen((open) => !open)}
        >
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {detailsOpen
              ? "Hide description"
              : form.getValues("description")
                ? `Description: ${form.getValues("description")}`
                : "Add description"}
          </Text>
        </Pressable>
        {detailsOpen ? (
          <View className="gap-3 pt-1">
            <FormTextareaField
              disabled={disabled}
              className="min-h-24"
              control={form.control}
              label="Description"
              maxLength={3009}
              name="description"
              numberOfLines={4}
              placeholder="What is this session for?"
            />
          </View>
        ) : null}
      </View>
    </Form>
  );
}
