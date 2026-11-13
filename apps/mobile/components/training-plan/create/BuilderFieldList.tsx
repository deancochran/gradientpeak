import { numericUxPolicies } from "@repo/core/utils/numeric-ux-policy";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useInputDraft } from "@repo/ui/hooks";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { PlanningInputFieldRow } from "@/components/training-plan/PlanningInputFieldRow";
import { omitUndefined } from "@/lib/omitUndefined";

export interface BuilderFieldDescriptor<TKey extends string = string> {
  key: TKey;
  label: string;
  inputKind: "number" | "derived";
  value: {
    value: number | null;
    source: string;
    unit: string | null;
    overridden?: boolean;
  };
  visible: boolean;
  required: boolean;
  reason: string | null;
  canRemove: boolean;
  defaultUnit?: string | null;
  helperText?: string;
  max?: number;
  min?: number;
  step?: number;
  decimals?: number;
}

interface BuilderFieldListProps<TKey extends string> {
  addLabel: string;
  emptyMessage: string;
  fields: BuilderFieldDescriptor<TKey>[];
  onAddField: (fieldKey: TKey) => void;
  onChangeField: (fieldKey: TKey, value: number | null) => void;
  onRemoveField: (fieldKey: TKey) => void;
  showSupportingText?: boolean;
  rawDrafts?: Record<string, string> | undefined;
  onRawDraftChange?: ((key: string, value: string) => void) | undefined;
  onInvalidChange?: ((key: string, message: string | null) => void) | undefined;
}

function formatFieldSource(source: string, overridden?: boolean) {
  if (overridden) return "Manual override";
  if (source === "training_status") return "Current fitness";
  if (source === "profile_metric") return "Profile metric";
  if (source === "activity_effort") return "Activity effort";
  if (source === "manual_override") return "Manual override";
  if (source === "default") return "Suggested default";
  if (source === "profile") return "Profile";
  return "Not set";
}

export function getBuilderNumberStep({ unitLabel }: { unitLabel?: string | null }) {
  const normalizedUnit = unitLabel?.toLowerCase();

  if (normalizedUnit === "kg" || normalizedUnit === "lb" || normalizedUnit === "lbs")
    return numericUxPolicies.weight.adjustmentStep;
  if (normalizedUnit === "cm") return numericUxPolicies.count.adjustmentStep;
  if (normalizedUnit === "bpm") return numericUxPolicies.plannedBpm.adjustmentStep;
  if (normalizedUnit === "w" || normalizedUnit === "watts")
    return numericUxPolicies.plannedPowerWatts.adjustmentStep;
  if (normalizedUnit === "h" || normalizedUnit === "hr" || normalizedUnit === "hours")
    return numericUxPolicies.durationHours.adjustmentStep;
  return numericUxPolicies.count.adjustmentStep;
}

export function BuilderFieldList<TKey extends string>({
  addLabel,
  emptyMessage,
  fields,
  onAddField,
  onChangeField,
  onRemoveField,
  showSupportingText = true,
  rawDrafts,
  onRawDraftChange,
  onInvalidChange,
}: BuilderFieldListProps<TKey>) {
  const visibleFields = fields.filter((field) => field.visible);
  const addableFields = fields.filter((field) => !field.visible && field.inputKind === "number");

  return (
    <View className="gap-4">
      {visibleFields.length > 0 ? (
        <View className="gap-1">
          {visibleFields.map((field, index) => (
            <View
              key={field.key}
              className={index < visibleFields.length - 1 ? "border-b border-border/70" : ""}
            >
              <PlanningInputFieldRow
                {...omitUndefined({
                  onClear: field.canRemove ? () => onRemoveField(field.key) : undefined,
                  supportingText: showSupportingText
                    ? field.required
                      ? field.reason
                      : field.helperText ||
                        formatFieldSource(field.value.source, field.value.overridden)
                    : undefined,
                })}
                label={field.label}
              >
                {field.inputKind === "derived" ? (
                  <Text className="text-sm text-foreground">
                    {field.value.value ?? "--"} {field.value.unit ?? field.defaultUnit ?? ""}
                  </Text>
                ) : (
                  <CompactNumberControl
                    {...omitUndefined({
                      max: field.max,
                      min: field.min,
                      step: field.step,
                      decimals: field.decimals,
                      rawValue: rawDrafts?.[field.key],
                      unitLabel: field.value.unit ?? field.defaultUnit ?? undefined,
                    })}
                    label={field.label}
                    onRawChange={(value) => {
                      onRawDraftChange?.(field.key, value);
                    }}
                    onInvalidChange={(invalid) => {
                      onInvalidChange?.(
                        field.key,
                        invalid ? `Correct ${field.label} or clear it.` : null,
                      );
                    }}
                    value={field.value.value}
                    onChange={(value) => onChangeField(field.key, value)}
                  />
                )}
              </PlanningInputFieldRow>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-sm leading-5 text-muted-foreground">{emptyMessage}</Text>
      )}
      {addableFields.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {addLabel}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {addableFields.map((field) => (
              <Button
                key={field.key}
                size="sm"
                variant="outline"
                onPress={() => onAddField(field.key)}
              >
                <Text className="text-sm font-medium text-foreground">{field.label}</Text>
              </Button>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CompactNumberControl({
  label,
  max,
  min = 0,
  onChange,
  step: providedStep,
  unitLabel,
  value,
  decimals,
  rawValue,
  onRawChange,
  onInvalidChange,
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number | null) => void;
  step?: number;
  unitLabel?: string;
  value: number | null;
  decimals?: number | undefined;
  rawValue?: string | undefined;
  onRawChange: (value: string) => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const step = providedStep ?? getBuilderNumberStep(omitUndefined({ unitLabel }));
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [draft, setDraft] = useInputDraft(rawValue ?? (value === null ? "" : String(value)));
  return (
    <BoundedNumberInput
      adjustmentStep={step}
      // Descriptors carry their semantic authoring precision. Do not invent a
      // high-precision fallback that makes every metric look equally precise.
      decimals={decimals ?? 2}
      clampProjection={false}
      onInvalidChange={(invalid) => {
        if (mounted.current) onInvalidChange(invalid);
      }}
      id={`builder-${label.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
      label={label}
      {...(max === undefined ? {} : { max })}
      min={min}
      onChange={(nextValue) => {
        if (!mounted.current) return;
        setDraft(nextValue);
        onRawChange(nextValue);
        if (!nextValue.trim()) onChange(null);
      }}
      onNumberChange={(nextValue) => {
        if (!mounted.current) return;
        // Invalid text is still being edited; it must not remove the optional field.
        if (nextValue !== undefined) onChange(nextValue);
      }}
      showAdjustmentButtons
      {...(unitLabel === undefined ? {} : { unitLabel })}
      value={draft}
    />
  );
}
