import type { TrainingPreferenceField } from "@repo/core";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { PercentSliderInput } from "@repo/ui/components/percent-slider-input";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { View } from "react-native";

type TrainingPreferenceFieldRendererProps = {
  disabledReason?: string | null;
  field: TrainingPreferenceField;
  isOverridden?: boolean;
  onChange?: (value: number | null) => void;
  onClear?: () => void;
  value?: number | null;
};

function resolveNumberValue(field: TrainingPreferenceField, value: number | null | undefined) {
  return value ?? field.requiredDefault ?? field.min ?? 0;
}

function convertPlanLocalValueForDisplay(
  field: TrainingPreferenceField,
  value: number | null | undefined,
) {
  const resolved = resolveNumberValue(field, value);

  if (field.id === "weeklyBudget") {
    return resolved * 60;
  }

  return resolved;
}

function convertPlanLocalValueForStorage(field: TrainingPreferenceField, value: number) {
  if (field.id === "weeklyBudget") {
    return Number((value / 60).toFixed(2));
  }

  return value;
}

function FieldFrame({
  children,
  field,
  isOverridden,
  onClear,
}: TrainingPreferenceFieldRendererProps & { children: ReactNode }) {
  return (
    <View className="gap-2 py-1" testID={`training-preference-field-${field.testIdStem}`}>
      {children}
      {onClear && isOverridden ? (
        <View className="items-end">
          <Button size="sm" variant="ghost" onPress={onClear}>
            <Text className="text-xs text-muted-foreground">Use default</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export function ReadOnlyTrainingPreferenceField({
  disabledReason,
  field,
}: {
  disabledReason: string;
  field: TrainingPreferenceField;
}) {
  return (
    <View
      className="gap-1 py-3 opacity-60"
      testID={`training-preference-field-${field.testIdStem}`}
    >
      <Text className="text-sm font-medium text-foreground">{field.label}</Text>
      <Text className="text-xs leading-4 text-muted-foreground">{disabledReason}</Text>
    </View>
  );
}

export function TrainingPreferenceFieldRenderer({
  disabledReason,
  field,
  isOverridden = false,
  onChange,
  onClear,
  value,
}: TrainingPreferenceFieldRendererProps) {
  if (disabledReason || !onChange) {
    return (
      <ReadOnlyTrainingPreferenceField
        disabledReason={disabledReason ?? "Profile-level only"}
        field={field}
      />
    );
  }

  const displayValue = convertPlanLocalValueForDisplay(field, value);

  if (field.control === "percent-slider") {
    return (
      <FieldFrame field={field} isOverridden={isOverridden} onClear={onClear}>
        <PercentSliderInput
          decimals={0}
          label={field.label}
          max={100}
          min={0}
          onChange={(nextValue) => onChange(Number((nextValue / 100).toFixed(4)))}
          showNumericInput={false}
          step={Math.max(1, Math.round((field.step ?? 0.01) * 100))}
          testId={`plan-local-preference-${field.testIdStem}`}
          value={Math.round(displayValue * 100)}
        />
      </FieldFrame>
    );
  }

  if (field.control === "integer-stepper") {
    return (
      <FieldFrame field={field} isOverridden={isOverridden} onClear={onClear}>
        <IntegerStepper
          label={field.label}
          max={field.max}
          min={field.min}
          onChange={(nextValue) => onChange(convertPlanLocalValueForStorage(field, nextValue))}
          step={field.step}
          testId={`plan-local-preference-${field.testIdStem}`}
          value={Math.round(displayValue)}
        />
      </FieldFrame>
    );
  }

  if (field.control === "bounded-number") {
    return (
      <FieldFrame field={field} isOverridden={isOverridden} onClear={onClear}>
        <BoundedNumberInput
          decimals={field.step && field.step < 1 ? 1 : 0}
          label={field.label}
          max={field.max}
          min={field.min}
          onChange={() => undefined}
          onNumberChange={(nextValue) => {
            onChange(
              typeof nextValue === "number"
                ? convertPlanLocalValueForStorage(field, nextValue)
                : null,
            );
          }}
          testId={`plan-local-preference-${field.testIdStem}`}
          unitLabel={field.unit ?? undefined}
          value={String(displayValue)}
        />
      </FieldFrame>
    );
  }

  return <ReadOnlyTrainingPreferenceField disabledReason="Profile-level only" field={field} />;
}
