import type { TrainingPreferenceValidationIssue } from "@repo/core";
import {
  type TrainingPreferenceField,
  type TrainingPreferenceTab,
  trainingPreferenceCatalog,
  trainingPreferenceTabs,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { AvailabilitySection } from "@/components/settings/training-preferences/sections/AvailabilitySection";
import { BaselineFitnessSection } from "@/components/settings/training-preferences/sections/BaselineFitnessSection";
import { TrainingPreferenceFieldRenderer } from "@/components/settings/training-preferences/TrainingPreferenceFieldRenderer";
import { TrainingPreferencesPanel } from "@/components/settings/training-preferences/TrainingPreferencesPanel";
import {
  type PreferencesTabKey,
  TrainingPreferencesTabs,
} from "@/components/settings/training-preferences/TrainingPreferencesTabs";
import type {
  TrainingPlanPreferenceFieldDescriptor,
  TrainingPlanPreferenceFieldKey,
} from "@/lib/training-plan-creation/preferences-context";

const planLocalTabs = trainingPreferenceTabs as PreferencesTabKey[];

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
  const canonicalFields = trainingPreferenceCatalog.filter(
    (field) => field.tab === (activeTab as TrainingPreferenceTab),
  );

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
        {activeTab === "availability" ? (
          <AvailabilitySection fields={canonicalFields} mode="plan-local-readonly" />
        ) : activeTab === "baseline-fitness" ? (
          <BaselineFitnessSection fields={canonicalFields} mode="plan-local-readonly" />
        ) : canonicalFields.length > 0 ? (
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

function getDisabledReason(field: TrainingPreferenceField) {
  if (field.planLocalSupport === "derived") {
    return "Derived from plan-specific preferences.";
  }

  if (field.planLocalSupport === "profile-only") {
    return "Profile-level preference.";
  }

  return null;
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
  const disabledReason = builderField ? null : getDisabledReason(catalogField);

  return (
    <TrainingPreferenceFieldRenderer
      disabledReason={disabledReason}
      field={catalogField}
      isOverridden={builderField?.value.overridden}
      onChange={builderField ? (value) => onChangeField(builderField.key, value) : undefined}
      onClear={builderField ? () => onRemoveField(builderField.key) : undefined}
      value={builderField?.value.value ?? null}
    />
  );
}
