import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Pressable, View } from "react-native";
import { PlanningInputFieldRow } from "@/components/training-plan/PlanningInputFieldRow";

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
}

interface BuilderFieldListProps<TKey extends string> {
  addLabel: string;
  emptyMessage: string;
  fields: BuilderFieldDescriptor<TKey>[];
  onAddField: (fieldKey: TKey) => void;
  onChangeField: (fieldKey: TKey, value: number | null) => void;
  onRemoveField: (fieldKey: TKey) => void;
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

export function getBuilderNumberStep({
  label,
  unitLabel,
}: {
  label: string;
  unitLabel?: string | null;
}) {
  const normalizedLabel = label.toLowerCase();
  const normalizedUnit = unitLabel?.toLowerCase();

  if (normalizedUnit === "kg" || normalizedUnit === "cm" || normalizedUnit === "bpm") return 1;
  if (normalizedUnit === "w" || normalizedUnit === "watts") return 5;
  if (normalizedUnit === "h" || normalizedUnit === "hr" || normalizedUnit === "hours") return 0.5;
  if (normalizedLabel.includes("hour")) return 0.5;
  if (normalizedLabel.includes("ftp") || normalizedLabel.includes("power")) return 5;
  if (normalizedLabel.includes("ctl")) return 5;
  if (normalizedLabel.includes("tss") || normalizedLabel.includes("load")) return 10;
  return 1;
}

export function BuilderFieldList<TKey extends string>({
  addLabel,
  emptyMessage,
  fields,
  onAddField,
  onChangeField,
  onRemoveField,
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
                label={field.label}
                onClear={field.canRemove ? () => onRemoveField(field.key) : undefined}
                supportingText={
                  field.required
                    ? field.reason
                    : formatFieldSource(field.value.source, field.value.overridden)
                }
              >
                {field.inputKind === "derived" ? (
                  <Text className="text-sm text-foreground">
                    {field.value.value ?? "--"} {field.value.unit ?? field.defaultUnit ?? ""}
                  </Text>
                ) : (
                  <CompactNumberControl
                    label={field.label}
                    value={field.value.value}
                    unitLabel={field.value.unit ?? field.defaultUnit ?? undefined}
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
  onChange,
  unitLabel,
  value,
}: {
  label: string;
  onChange: (value: number | null) => void;
  unitLabel?: string;
  value: number | null;
}) {
  const step = getBuilderNumberStep({ label, unitLabel });
  const nextValue = value ?? 0;
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-2xl bg-muted/30 px-3 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        className="h-9 w-9 items-center justify-center rounded-full bg-background"
        disabled={value === null || value <= 0}
        onPress={() => onChange(value !== null && value - step > 0 ? value - step : null)}
      >
        <Text className="text-lg font-medium text-foreground">−</Text>
      </Pressable>
      <View className="min-w-0 flex-1 items-center">
        <Text className="text-base font-semibold text-foreground">
          {value === null ? "Not set" : `${value}${unitLabel ? ` ${unitLabel}` : ""}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        className="h-9 w-9 items-center justify-center rounded-full bg-background"
        onPress={() => onChange(nextValue + step)}
      >
        <Text className="text-lg font-medium text-foreground">+</Text>
      </Pressable>
    </View>
  );
}
