import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { UseFormReturn } from "react-hook-form";
import { View } from "react-native";

interface TrainingPlanMetadataSectionProps {
  form: UseFormReturn<any>;
}

export function TrainingPlanMetadataSection({ form }: TrainingPlanMetadataSectionProps) {
  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-3">
      <Text className="font-semibold">Plan details</Text>
      <Text className="text-xs text-muted-foreground">
        Manage plan identity, lifecycle, and deletion from this section.
      </Text>

      <Form {...form}>
        <View className="gap-4">
          <FormTextField
            control={form.control}
            label="Plan name"
            maxLength={120}
            name="name"
            placeholder="Enter plan name"
            required
            testId="training-plan-name-input"
          />

          <FormTextareaField
            control={form.control}
            label="Description"
            maxLength={500}
            name="description"
            numberOfLines={3}
            placeholder="Optional description"
            testId="training-plan-description-input"
          />
        </View>
      </Form>

      <Text className="text-xs text-muted-foreground">
        Training plan activation is controlled when you apply a template to your schedule.
      </Text>
    </View>
  );
}
