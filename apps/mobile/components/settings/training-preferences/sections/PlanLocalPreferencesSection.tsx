import type { TrainingPreferenceValidationIssue } from "@repo/core";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { PercentSliderInput } from "@repo/ui/components/percent-slider-input";
import { Text } from "@repo/ui/components/text";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { TrainingPreferencesPanel } from "@/components/settings/training-preferences/TrainingPreferencesPanel";
import {
  type PreferencesTabKey,
  TrainingPreferencesTabs,
} from "@/components/settings/training-preferences/TrainingPreferencesTabs";
import type {
  TrainingPlanPreferenceFieldDescriptor,
  TrainingPlanPreferenceFieldKey,
} from "@/lib/training-plan-creation/preferences-context";
import { TRAINING_PLAN_PREFERENCE_FIELD_REGISTRY } from "@/lib/training-plan-creation/preferences-context";

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
  onChangeField: (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) => void;
  onRemoveField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
};

export function PlanLocalPreferencesSection({
  fields,
  issues = [],
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
    .map((field) => ({ ...field, helperText: "", reason: null, visible: true }));

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
            <PlanLocalPreferenceField
              key={field.key}
              field={field}
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

function getPlanLocalDisplayValue(field: TrainingPlanPreferenceFieldDescriptor) {
  return field.value.value ?? TRAINING_PLAN_PREFERENCE_FIELD_REGISTRY[field.key].requiredDefault;
}

function PlanLocalPreferenceField({
  field,
  onChangeField,
  onRemoveField,
}: {
  field: TrainingPlanPreferenceFieldDescriptor;
  onChangeField: (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) => void;
  onRemoveField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
}) {
  const displayValue = getPlanLocalDisplayValue(field);
  const isPercentField = field.max <= 1 && field.defaultUnit === null;
  const isIntegerField = Number.isInteger(field.step) && Number.isInteger(field.min);
  const showClear = field.value.overridden;
  const clearButton = showClear ? (
    <View className="items-end">
      <Button size="sm" variant="ghost" onPress={() => onRemoveField(field.key)}>
        <Text className="text-xs text-muted-foreground">Clear</Text>
      </Button>
    </View>
  ) : null;

  if (isPercentField) {
    return (
      <View className="gap-2">
        <PercentSliderInput
          decimals={0}
          label={field.label}
          max={100}
          min={0}
          onChange={(value) => onChangeField(field.key, Number((value / 100).toFixed(4)))}
          showNumericInput={false}
          step={Math.max(1, Math.round((field.step ?? 0.01) * 100))}
          testId={`plan-local-preference-${field.key}`}
          value={Math.round(displayValue * 100)}
        />
        {clearButton}
      </View>
    );
  }

  if (isIntegerField && field.defaultUnit !== "hr") {
    return (
      <View className="gap-2">
        <IntegerStepper
          id={`plan-local-preference-${field.key}`}
          label={field.label}
          max={field.max}
          min={field.min}
          onChange={(value) => onChangeField(field.key, value)}
          step={field.step}
          testId={`plan-local-preference-${field.key}`}
          value={Math.round(displayValue)}
        />
        {clearButton}
      </View>
    );
  }

  return (
    <View className="gap-2">
      <BoundedNumberInput
        decimals={field.step && field.step < 1 ? 1 : 0}
        id={`plan-local-preference-${field.key}`}
        label={field.label}
        max={field.max}
        min={field.min}
        onChange={() => undefined}
        onNumberChange={(value) => onChangeField(field.key, value ?? null)}
        testId={`plan-local-preference-${field.key}`}
        unitLabel={field.defaultUnit ?? undefined}
        value={String(displayValue)}
      />
      {clearButton}
    </View>
  );
}
