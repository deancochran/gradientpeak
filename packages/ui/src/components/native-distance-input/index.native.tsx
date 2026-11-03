import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../button/index.native";
import { NativePicker } from "../native-picker/index.native";
import { Text } from "../text/index.native";

export type NativeDistanceUnit = "meters" | "km";
type Precision = "coarse" | "fine";

export interface NativeDistanceInputProps {
  label: string;
  valueMeters: number | undefined;
  minMeters: number;
  maxMeters: number;
  unit: NativeDistanceUnit;
  onUnitChange: (unit: NativeDistanceUnit) => void;
  onChangeMeters: (meters: number) => void;
  disabled?: boolean;
  isCurrent?: () => boolean;
  testId?: string;
  presetsMeters?: readonly number[];
}

const display = (meters: number, unit: NativeDistanceUnit) =>
  unit === "km" ? `${(meters / 1000).toFixed(3).replace(/\.?0+$/, "")} km` : `${meters} m`;

/** One semantic value wheel with explicit precision and non-mutating range navigation. */
export function NativeDistanceInput({
  disabled = false,
  isCurrent,
  presetsMeters = [200, 400, 1000, 5000],
  ...props
}: NativeDistanceInputProps) {
  const mounted = useRef(true);
  const [precision, setPrecision] = useState<Precision>("coarse");
  const presetsKey = presetsMeters.join(",");
  const ownerCurrent = isCurrent?.() ?? true;
  const availability = useRef({
    disabled,
    minMeters: props.minMeters,
    maxMeters: props.maxMeters,
    unit: props.unit,
    precision,
    presetsKey,
    owner: isCurrent,
    ownerCurrent,
    generation: 0,
  });
  const previousAvailability = availability.current;
  if (
    previousAvailability.disabled !== disabled ||
    previousAvailability.minMeters !== props.minMeters ||
    previousAvailability.maxMeters !== props.maxMeters ||
    previousAvailability.unit !== props.unit ||
    previousAvailability.precision !== precision ||
    previousAvailability.presetsKey !== presetsKey ||
    previousAvailability.owner !== isCurrent ||
    previousAvailability.ownerCurrent !== ownerCurrent
  )
    availability.current = {
      disabled,
      minMeters: props.minMeters,
      maxMeters: props.maxMeters,
      unit: props.unit,
      precision,
      presetsKey,
      owner: isCurrent,
      ownerCurrent,
      generation: previousAvailability.generation + 1,
    };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hasValidBounds =
    Number.isSafeInteger(props.minMeters) &&
    Number.isSafeInteger(props.maxMeters) &&
    props.minMeters >= 0 &&
    props.maxMeters >= props.minMeters;
  const valid =
    hasValidBounds &&
    props.valueMeters !== undefined &&
    Number.isSafeInteger(props.valueMeters) &&
    props.valueMeters >= props.minMeters &&
    props.valueMeters <= props.maxMeters;
  const canonicalValue = valid ? props.valueMeters : undefined;
  const [centre, setCentre] = useState(() => canonicalValue ?? 0);
  const step = precision === "fine" ? 1 : 100;
  const generation = availability.current.generation;
  useEffect(() => {
    setCentre(canonicalValue ?? 0);
  }, [canonicalValue]);
  const usable = () =>
    mounted.current &&
    !disabled &&
    !availability.current.disabled &&
    availability.current.generation === generation &&
    (isCurrent?.() ?? true);
  const commit = (meters: number) => {
    if (
      !usable() ||
      !hasValidBounds ||
      !Number.isSafeInteger(meters) ||
      meters < props.minMeters ||
      meters > props.maxMeters
    )
      return;
    setCentre(meters);
    props.onChangeMeters(meters);
  };
  const options = useMemo(() => {
    const maxMeters = hasValidBounds ? props.maxMeters : 0;
    const minMeters = hasValidBounds && props.valueMeters !== undefined ? props.minMeters : 0;
    const base = Math.max(0, Math.min(maxMeters, Math.round(centre / step) * step));
    const start = Math.max(0, Math.min(maxMeters - 100 * step, base - 50 * step));
    const values = Array.from(
      { length: Math.min(101, Math.floor((maxMeters - start) / step) + 1) },
      (_, i) => start + i * step,
    );
    const inRangeValues = values.filter((value) => value >= minMeters);
    if (valid && !inRangeValues.includes(props.valueMeters as number))
      inRangeValues.push(props.valueMeters as number);
    return [...new Set(inRangeValues)]
      .sort((a, b) => a - b)
      .map((value) => ({ value, label: display(value, props.unit) }));
  }, [
    centre,
    hasValidBounds,
    props.maxMeters,
    props.minMeters,
    props.unit,
    props.valueMeters,
    step,
    valid,
  ]);
  const selected = props.valueMeters ?? 0;
  const navigationMinimum = props.valueMeters === undefined ? 0 : props.minMeters;
  return (
    <View className="gap-2" testID={props.testId}>
      <Text className="text-sm font-medium">{props.label}</Text>
      <Text accessibilityLiveRegion="none">
        {valid
          ? display(selected, props.unit)
          : props.valueMeters === undefined
            ? "Not set"
            : `${props.valueMeters} m needs correction`}
      </Text>
      <View
        className="flex-row gap-1"
        accessibilityRole="radiogroup"
        accessibilityLabel={`${props.label} unit`}
      >
        {(["meters", "km"] as const).map((unit) => (
          <Button
            key={unit}
            disabled={disabled}
            size="sm"
            variant="ghost"
            accessibilityRole="radio"
            accessibilityState={{ selected: props.unit === unit }}
            onPress={() => {
              if (usable()) props.onUnitChange(unit);
            }}
          >
            <Text>{unit === "meters" ? "m" : "km"}</Text>
          </Button>
        ))}
      </View>
      <View
        className="flex-row gap-1"
        accessibilityRole="radiogroup"
        accessibilityLabel={`${props.label} precision`}
      >
        {(["coarse", "fine"] as const).map((next) => (
          <Button
            key={next}
            disabled={disabled}
            size="sm"
            variant="ghost"
            accessibilityRole="radio"
            accessibilityState={{ selected: precision === next }}
            onPress={() => {
              if (usable()) setPrecision(next);
            }}
          >
            <Text>{next === "coarse" ? "Coarse (100 m)" : "Fine (1 m)"}</Text>
          </Button>
        ))}
      </View>
      <View className="flex-row items-center gap-1">
        <Button
          disabled={disabled || !hasValidBounds || centre <= navigationMinimum}
          size="sm"
          variant="ghost"
          accessibilityLabel={`Earlier ${props.label} values`}
          onPress={() => {
            if (usable()) setCentre((value) => Math.max(navigationMinimum, value - 100 * step));
          }}
        >
          <Text>Earlier</Text>
        </Button>
        <View className="flex-1">
          <NativePicker
            disabled={disabled}
            isCurrent={usable}
            label={`${props.label} value`}
            value={selected}
            options={options}
            onChange={commit}
          />
        </View>
        <Button
          disabled={disabled || !hasValidBounds || centre >= props.maxMeters}
          size="sm"
          variant="ghost"
          accessibilityLabel={`Later ${props.label} values`}
          onPress={() => {
            if (usable()) setCentre((value) => Math.min(props.maxMeters, value + 100 * step));
          }}
        >
          <Text>Later</Text>
        </Button>
      </View>
      <View className="flex-row flex-wrap gap-1">
        {presetsMeters
          .filter(
            (value) =>
              hasValidBounds &&
              Number.isSafeInteger(value) &&
              value >= props.minMeters &&
              value <= props.maxMeters,
          )
          .map((value) => (
            <Button
              key={value}
              disabled={disabled}
              size="sm"
              variant="ghost"
              onPress={() => commit(value)}
            >
              <Text>{display(value, value >= 1000 ? "km" : "meters")}</Text>
            </Button>
          ))}
      </View>
      {!valid && props.valueMeters !== undefined ? (
        <Text accessibilityRole="alert" className="text-destructive">
          Existing distance needs correction; choose a value from {props.minMeters} to{" "}
          {props.maxMeters} m.
        </Text>
      ) : null}
    </View>
  );
}
