import {
  convertWeightToKg,
  formatWeightForDisplay,
  getWeightBounds,
} from "@repo/core/utils/fitness-inputs";
import type { NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
import { useEffect, useRef, useState } from "react";
import type { WeightInputFieldProps } from "./shared";

export function useWeightInput(props: WeightInputFieldProps) {
  const display = formatWeightForDisplay(props.valueKg, props.unit, 2);
  const [invalid, setInvalid] = useState(false);
  const latest = useRef({ disabled: props.disabled, invalid });
  latest.current = { disabled: props.disabled, invalid };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const owner = useRef({
    resetKey: props.resetKey,
    unit: props.unit,
    disabled: props.disabled,
    generation: 0,
  });
  if (
    owner.current.resetKey !== props.resetKey ||
    owner.current.unit !== props.unit ||
    owner.current.disabled !== props.disabled
  ) {
    owner.current = {
      resetKey: props.resetKey,
      unit: props.unit,
      disabled: props.disabled,
      generation: owner.current.generation + 1,
    };
  }
  const generation = owner.current.generation;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset/unit identity owns the transient validity flag.
  useEffect(() => {
    setInvalid(false);
  }, [props.resetKey, props.unit]);
  const bounds = getWeightBounds(props.unit);
  const convert = (result: NumericInputResult): NumericInputResult => {
    if (result.status !== "valid") return result;
    // A representation-equivalent edit must not quantize a precise stored kg value.
    const value =
      props.valueKg != null && Number.isFinite(props.valueKg) && result.value === Number(display)
        ? props.valueKg
        : convertWeightToKg(result.value, props.unit);
    return { status: "valid", value };
  };
  return {
    text: display,
    bounds,
    change: () => undefined,
    result: (input: NumericInputResult) => {
      const result = convert(input);
      setInvalid(result.status === "invalid");
      latest.current.invalid = result.status === "invalid";
      props.onInputResult?.(result);
      if (result.status === "valid") props.onChangeKg(result.value);
      else if (result.status === "empty") props.onChangeKg(null);
    },
    invalid,
    reportInvalid: (value: boolean) => {
      latest.current.invalid = value;
      setInvalid(value);
      props.onInvalidChange?.(value);
    },
    changeUnit: (unit: WeightInputFieldProps["unit"]) => {
      if (
        alive.current &&
        owner.current.generation === generation &&
        !latest.current.disabled &&
        !latest.current.invalid
      )
        props.onUnitChange?.(unit);
    },
  };
}
