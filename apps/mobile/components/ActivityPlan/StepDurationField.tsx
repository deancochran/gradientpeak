import { FormNumberField, FormSelectField } from "@repo/ui/components/form";
import type { UseFormReturn } from "react-hook-form";
import { View } from "react-native";

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

export type StepDurationValue =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "repetitions"; count: number };

type DurationFormShape = {
  duration: StepDurationValue;
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

function fromUIValue(
  type: StepDurationValue["type"],
  value: number,
  unit: string,
): StepDurationValue {
  if (type === "time") {
    if (unit === "hours") {
      return { type, seconds: Math.round(value * 3600) };
    }
    if (unit === "minutes") {
      return { type, seconds: Math.round(value * 60) };
    }
    return { type, seconds: Math.round(value) };
  }

  if (type === "distance") {
    if (unit === "km") {
      return { type, meters: Math.round(value * 1000) };
    }
    return { type, meters: Math.round(value) };
  }

  return { type, count: Math.round(value) };
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

export function StepDurationField({ form }: { form: UseFormReturn<DurationFormShape> }) {
  const SelectField = FormSelectField as any;
  const NumberField = FormNumberField as any;
  const duration = form.watch("duration");
  const current = toUIValue(duration);
  const units = getDurationUnits(duration.type);

  return (
    <View className="gap-3">
      <SelectField
        control={form.control}
        formatValue={() => duration.type}
        label="Duration Type"
        name={"duration.type" as never}
        options={DURATION_TYPES}
        parseValue={(value: string) => {
          if (value === "distance") {
            return "distance" as never;
          }
          if (value === "repetitions") {
            return "repetitions" as never;
          }
          return "time" as never;
        }}
        placeholder="Select duration type"
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <NumberField
            allowDecimal={duration.type === "distance" && current.unit === "km"}
            control={form.control}
            formatValue={() => String(current.value)}
            label="Value"
            min={1}
            name={
              duration.type === "time"
                ? ("duration.seconds" as never)
                : duration.type === "distance"
                  ? ("duration.meters" as never)
                  : ("duration.count" as never)
            }
            parseValue={(raw: string) => {
              const next = Number(raw);
              if (!Number.isFinite(next)) {
                return undefined as never;
              }
              return fromUIValue(duration.type, next, current.unit) as never;
            }}
            placeholder="0"
          />
        </View>

        <View className="w-32">
          <SelectField
            control={form.control}
            formatValue={() => current.unit}
            label="Unit"
            name={"duration.type" as never}
            options={units}
            parseValue={(unit: string) => fromUIValue(duration.type, current.value, unit) as never}
            placeholder="Unit"
          />
        </View>
      </View>
    </View>
  );
}
