import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { durationForType, fromUIValue, type StepDurationValue } from "./stepDurationValues";

type Option = { value: string; label: string };

const DURATION_TYPES: Option[] = [
  { value: "time", label: "Time-based" },
  { value: "distance", label: "Distance-based" },
  { value: "repetitions", label: "Repetitions" },
];

const TIME_UNITS: Option[] = [
  { value: "seconds", label: "seconds" },
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
];

const DISTANCE_UNITS: Option[] = [
  { value: "meters", label: "meters" },
  { value: "km", label: "km" },
];

const REP_UNITS: Option[] = [{ value: "reps", label: "reps" }];

export type { StepDurationValue } from "./stepDurationValues";

export type DurationFormShape = {
  duration: StepDurationValue;
};

type DurationFormAdapter = {
  getValues: () => DurationFormShape;
  setValue: (
    name: "duration",
    value: StepDurationValue,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
  ) => void;
};

function toUIValue(duration: StepDurationValue): { value: number; unit: string } {
  if (duration.type === "time") {
    if (duration.seconds >= 3600 && duration.seconds % 3600 === 0) {
      return { value: duration.seconds / 3600, unit: "hours" };
    }
    if (duration.seconds >= 60 && duration.seconds % 60 === 0) {
      return { value: duration.seconds / 60, unit: "minutes" };
    }
    return { value: duration.seconds, unit: "seconds" };
  }

  if (duration.type === "distance") {
    if (duration.meters >= 1000 && duration.meters % 1000 === 0) {
      return { value: duration.meters / 1000, unit: "km" };
    }
    return { value: duration.meters, unit: "meters" };
  }

  return { value: duration.count, unit: "reps" };
}

function getDurationUnits(type: StepDurationValue["type"]): Option[] {
  if (type === "time") {
    return TIME_UNITS;
  }
  if (type === "distance") {
    return DISTANCE_UNITS;
  }
  return REP_UNITS;
}

export function StepDurationField({ form }: { form: DurationFormAdapter }) {
  const duration = form.getValues().duration;
  const current = toUIValue(duration);
  const units = getDurationUnits(duration.type);
  const canonicalValue = String(current.value);
  const [draftValue, setDraftValue] = useState(canonicalValue);

  useEffect(() => {
    setDraftValue(canonicalValue);
  }, [canonicalValue]);

  const setDuration = (next: StepDurationValue) =>
    form.setValue("duration", next, { shouldDirty: true, shouldValidate: true });

  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">Duration type</Text>
        <View className="flex-row flex-wrap gap-2" testID="step-duration-type">
          {DURATION_TYPES.map((option) => (
            <Button
              key={option.value}
              onPress={() => {
                if (option.value === "distance") {
                  setDuration(durationForType("distance"));
                } else if (option.value === "repetitions") {
                  setDuration(durationForType("repetitions"));
                } else {
                  setDuration(durationForType("time"));
                }
              }}
              testID={`step-duration-type-${option.value}`}
              variant={duration.type === option.value ? "default" : "outline"}
            >
              <Text
                className={
                  duration.type === option.value ? "text-primary-foreground" : "text-foreground"
                }
              >
                {option.label}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Duration ({current.unit})</Text>
            <Input
              accessibilityLabel={`Duration (${current.unit})`}
              keyboardType="decimal-pad"
              onBlur={() => {
                const next = Number(draftValue);
                if (draftValue !== "" && Number.isFinite(next)) {
                  setDuration(fromUIValue(duration.type, next, current.unit));
                  return;
                }
                setDraftValue(canonicalValue);
              }}
              onChangeText={(raw) => {
                setDraftValue(raw);
                if (raw === "" || raw.endsWith(".")) return;
                const next = Number(raw);
                if (!Number.isFinite(next)) return;
                setDuration(fromUIValue(duration.type, next, current.unit));
              }}
              placeholder="0"
              testId="step-duration-value"
              value={draftValue}
            />
          </View>
        </View>

        <View className="w-32">
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Unit</Text>
            <View className="gap-1" testID="step-duration-unit">
              {units.map((unit) => (
                <Button
                  key={unit.value}
                  onPress={() => setDuration(fromUIValue(duration.type, current.value, unit.value))}
                  testID={`step-duration-unit-${unit.value}`}
                  variant={current.unit === unit.value ? "default" : "outline"}
                >
                  <Text
                    className={
                      current.unit === unit.value ? "text-primary-foreground" : "text-foreground"
                    }
                  >
                    {unit.label}
                  </Text>
                </Button>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
