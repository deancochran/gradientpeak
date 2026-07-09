import type { TrainingPreferenceValidationIssue } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import {
  type PreferencesTabKey,
  TrainingPreferencesTabs,
} from "@/components/settings/training-preferences/TrainingPreferencesTabs";
import { BuilderFieldList } from "@/components/training-plan/create/BuilderFieldList";
import type {
  TrainingPlanPreferenceFieldDescriptor,
  TrainingPlanPreferenceFieldKey,
} from "@/lib/training-plan-creation/preferences-context";

const planLocalTabs: PreferencesTabKey[] = [
  "schedule",
  "training-style",
  "recovery",
  "goal-strategy",
];

const planLocalFieldGroups: Record<PreferencesTabKey, TrainingPlanPreferenceFieldKey[]> = {
  preferences: [],
  availability: [],
  schedule: [
    "durationWeeks",
    "weeklySessionCount",
    "targetWeeklyHours",
    "restDaysPerWeek",
    "maxSingleSessionDurationMinutes",
  ],
  "training-style": [
    "progressionPace",
    "weekPatternPreference",
    "strengthIntegrationPriority",
    "doubleDayTolerance",
    "longSessionFatigueTolerance",
  ],
  recovery: ["recoveryPriority"],
  "goal-strategy": ["taperStylePreference"],
  "baseline-fitness": [],
};

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
  const [activeTab, setActiveTab] = useState<PreferencesTabKey>("schedule");
  const fieldByKey = useMemo(
    () => new Map(fields.map((field) => [field.key, field] as const)),
    [fields],
  );
  const canonicalFields = planLocalFieldGroups[activeTab]
    .map((fieldKey) => fieldByKey.get(fieldKey))
    .filter((field): field is TrainingPlanPreferenceFieldDescriptor => Boolean(field))
    .map((field) => ({ ...field, helperText: undefined, reason: null, visible: true }));

  useEffect(() => {
    if (!planLocalTabs.includes(activeTab)) {
      setActiveTab("schedule");
    }
  }, [activeTab]);

  return (
    <View className="gap-4">
      <TrainingPreferencesTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        visibleTabs={planLocalTabs}
      />
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
        addLabel="Add preference"
        emptyMessage="No preferences in this group."
        fields={canonicalFields}
        onAddField={onAddField}
        onChangeField={onChangeField}
        onRemoveField={onRemoveField}
        showSupportingText={false}
      />
    </View>
  );
}
