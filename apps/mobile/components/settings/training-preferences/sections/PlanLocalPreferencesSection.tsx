import type { TrainingPreferenceValidationIssue } from "@repo/core";
import {
  type TrainingPreferenceField,
  type TrainingPreferenceTab,
  trainingPreferenceCatalog,
} from "@repo/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { TrainingPreferenceFieldRenderer } from "@/components/settings/training-preferences/TrainingPreferenceFieldRenderer";
import { TrainingPreferencesPanel } from "@/components/settings/training-preferences/TrainingPreferencesPanel";
import type {
  TrainingPlanPreferenceFieldDescriptor,
  TrainingPlanPreferenceFieldKey,
} from "@/lib/training-plan-creation/preferences-context";

const planLocalGroups = Array.from(
  new Set(
    trainingPreferenceCatalog
      .filter((field) => field.planLocalSupport === "editable" && field.planLocalKey)
      .map((field) => field.tab),
  ),
) as TrainingPreferenceTab[];

const planLocalGroupLabels: Record<TrainingPreferenceTab, string> = {
  preferences: "Adaptation",
  availability: "Availability",
  schedule: "Schedule",
  "baseline-fitness": "Baseline fitness",
  "training-style": "Training style",
  recovery: "Recovery",
  "goal-strategy": "Goal strategy",
};

type PlanLocalPreferencesSectionProps = {
  fields: TrainingPlanPreferenceFieldDescriptor[];
  issues?: TrainingPreferenceValidationIssue[];
  onChangeField: (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) => void;
  onRemoveField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
};

export function PlanLocalPreferencesSection({
  fields,
  issues = [],
  onChangeField,
  onRemoveField,
}: PlanLocalPreferencesSectionProps) {
  const [activeTab, setActiveTab] = useState<TrainingPreferenceTab>(
    planLocalGroups[0] ?? "schedule",
  );
  const fieldByKey = useMemo(
    () => new Map(fields.map((field) => [field.key, field] as const)),
    [fields],
  );
  const canonicalFields = trainingPreferenceCatalog.filter(
    (field) =>
      field.tab === activeTab && field.planLocalSupport === "editable" && field.planLocalKey,
  );

  useEffect(() => {
    if (!planLocalGroups.includes(activeTab)) {
      setActiveTab(planLocalGroups[0] ?? "schedule");
    }
  }, [activeTab]);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">Preference group</Text>
        <Select
          value={{ label: planLocalGroupLabels[activeTab], value: activeTab }}
          onValueChange={(option) => {
            if (option?.value) setActiveTab(option.value as TrainingPreferenceTab);
          }}
        >
          <SelectTrigger accessibilityLabel="Preference group" className="min-h-11">
            <SelectValue placeholder="Select a preference group" />
          </SelectTrigger>
          <SelectContent>
            {planLocalGroups.map((group) => (
              <SelectItem key={group} label={planLocalGroupLabels[group]} value={group}>
                {planLocalGroupLabels[group]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>
      <TrainingPreferencesPanel>
        {issues.length > 0 ? (
          <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            {issues.map((issue) => (
              <Text
                key={`${issue.code}-${issue.fields.join("-")}`}
                className="text-xs font-medium leading-4 text-destructive"
              >
                {issue.message}
              </Text>
            ))}
          </View>
        ) : null}
        {canonicalFields.length > 0 ? (
          canonicalFields.map((field) => (
            <PlanLocalCatalogPreferenceField
              key={field.id}
              catalogField={field}
              builderField={
                field.planLocalKey
                  ? fieldByKey.get(field.planLocalKey as TrainingPlanPreferenceFieldKey)
                  : undefined
              }
              onChangeField={onChangeField}
              onRemoveField={onRemoveField}
            />
          ))
        ) : (
          <Text className="text-sm leading-5 text-muted-foreground">
            No preferences in this group.
          </Text>
        )}
      </TrainingPreferencesPanel>
    </View>
  );
}

function PlanLocalCatalogPreferenceField({
  builderField,
  catalogField,
  onChangeField,
  onRemoveField,
}: {
  builderField?: TrainingPlanPreferenceFieldDescriptor;
  catalogField: TrainingPreferenceField;
  onChangeField: (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) => void;
  onRemoveField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
}) {
  return (
    <TrainingPreferenceFieldRenderer
      field={catalogField}
      isOverridden={builderField?.value.overridden}
      onChange={builderField ? (value) => onChangeField(builderField.key, value) : undefined}
      onClear={builderField ? () => onRemoveField(builderField.key) : undefined}
      value={builderField?.value.value ?? null}
    />
  );
}
