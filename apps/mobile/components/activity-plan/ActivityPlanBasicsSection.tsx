import { Button } from "@repo/ui/components/button";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Pencil } from "lucide-react-native";
import { useState } from "react";
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
  const [descriptionOpen, setDescriptionOpen] = useState(Boolean(form.getValues("description")));
  const [nameOpen, setNameOpen] = useState(Boolean(form.getValues("name")));
  const [nameSnapshot, setNameSnapshot] = useState(() => form.getValues("name"));
  const name = form.watch("name");
  const description = form.watch("description");
  return (
    <Form {...form}>
      <View className="gap-3">
        <View className="flex-row items-end gap-3" testID="activity-plan-name-row">
          <View className="min-w-0 flex-1">
            {nameOpen ? (
              <View className="gap-1">
                <FormTextField
                  disabled={disabled}
                  control={form.control}
                  label="Plan name"
                  name="name"
                  placeholder="Plan name"
                  required
                />
                <View className="flex-row gap-3">
                  <Button
                    accessibilityLabel="Clear plan name"
                    disabled={disabled}
                    size="sm"
                    variant="ghost"
                    className="min-h-10 self-start px-1"
                    onPress={() =>
                      form.setValue("name", "", { shouldDirty: true, shouldTouch: true })
                    }
                  >
                    <Text className="text-muted-foreground">Clear</Text>
                  </Button>
                  <Button
                    accessibilityLabel="Cancel plan name"
                    disabled={disabled}
                    size="sm"
                    variant="ghost"
                    className="min-h-10 self-start px-1"
                    onPress={() => {
                      form.setValue("name", nameSnapshot, { shouldDirty: true });
                      setNameOpen(false);
                    }}
                  >
                    <Text className="text-muted-foreground">Cancel</Text>
                  </Button>
                </View>
              </View>
            ) : (
              <View className="min-h-12 flex-row items-center gap-1">
                <Text className="min-w-0 flex-1 text-xl font-semibold" numberOfLines={1}>
                  {name.trim() || "New plan"}
                </Text>
                <Button
                  accessibilityLabel="Edit plan name"
                  disabled={disabled}
                  size="icon"
                  variant="ghost"
                  className="min-h-12 min-w-12"
                  onPress={() => {
                    setNameSnapshot(name);
                    setNameOpen(true);
                  }}
                >
                  <Icon as={Pencil} size={16} className="text-muted-foreground" />
                </Button>
              </View>
            )}
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

        {descriptionOpen ? (
          <View className="gap-1">
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
            <View className="flex-row gap-3">
              <Button
                accessibilityLabel="Clear description"
                disabled={disabled}
                size="sm"
                variant="ghost"
                className="min-h-10 self-start px-1"
                onPress={() => {
                  form.setValue("description", "", { shouldDirty: true, shouldTouch: true });
                  setDescriptionOpen(false);
                }}
              >
                <Text className="text-muted-foreground">Clear</Text>
              </Button>
              {!description ? (
                <Button
                  accessibilityLabel="Cancel description"
                  disabled={disabled}
                  size="sm"
                  variant="ghost"
                  className="min-h-10 self-start px-1"
                  onPress={() => setDescriptionOpen(false)}
                >
                  <Text className="text-muted-foreground">Cancel</Text>
                </Button>
              ) : null}
            </View>
          </View>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start px-1"
            onPress={() => setDescriptionOpen(true)}
          >
            <Text>Add description</Text>
          </Button>
        )}
      </View>
    </Form>
  );
}
