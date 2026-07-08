import type { TrainingPreferenceValidationIssue } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { BuilderFieldList } from "@/components/training-plan/create/BuilderFieldList";
import type {
  TrainingPlanPreferenceFieldDescriptor,
  TrainingPlanPreferenceFieldKey,
} from "@/lib/training-plan-creation/preferences-context";

type PlanLocalPreferencesSectionProps = {
  fields: TrainingPlanPreferenceFieldDescriptor[];
  issues?: TrainingPreferenceValidationIssue[];
  onAddField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
  onChangeField: (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) => void;
  onRemoveField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
};

export function PlanLocalPreferencesSection({
  fields,
  issues = [],
  onAddField,
  onChangeField,
  onRemoveField,
}: PlanLocalPreferencesSectionProps) {
  const canonicalFields = fields.map((field) => ({ ...field, visible: true }));

  return (
    <View className="gap-4">
      <Text className="text-sm leading-5 text-muted-foreground">
        Edit plan-local overrides for this training plan only. Global athlete preferences stay in
        Training Preferences. Clear a value to let the builder derive it from submitted goals,
        sessions, and activities.
      </Text>
      {issues.length > 0 ? (
        <View className="gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2">
          <Text className="text-sm font-semibold text-foreground">
            Review plan preference constraints
          </Text>
          {issues.map((issue) => (
            <Text
              key={`${issue.code}-${issue.fields.join("-")}`}
              className={
                issue.severity === "blocking"
                  ? "text-xs leading-4 text-destructive"
                  : "text-xs leading-4 text-muted-foreground"
              }
            >
              {issue.message}
            </Text>
          ))}
        </View>
      ) : null}
      <BuilderFieldList
        addLabel="Additional preferences"
        emptyMessage="No planning preferences are available."
        fields={canonicalFields}
        onAddField={onAddField}
        onChangeField={onChangeField}
        onRemoveField={onRemoveField}
      />
    </View>
  );
}
