import { formatNumberForInput } from "@repo/core/utils/fitness-inputs";
import { nudgeNumberByStep, parseNumericInput } from "@repo/core/utils/numeric-ux-policy";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import type { BoundedNumberInputProps } from "./shared";

export function useBoundedNumberInput(props: BoundedNumberInputProps, focus: () => void) {
  const {
    min = 0,
    max = Infinity,
    decimals = 2,
    precision = decimals === 0 ? "integer" : "decimal",
  } = props;
  const input = useSemanticInput({
    value: props.value,
    identity: props.resetKey,
    disabled: props.disabled,
    required: props.required,
    parse: (raw) => parseNumericInput(raw, { min, max, precision }),
    onText: (raw) => props.onChange(raw),
    normalize: String,
    echoes: (result) =>
      result.status === "valid"
        ? [String(result.value), formatNumberForInput(result.value, decimals)]
        : ["", "NaN"],
    onResult: (result) => {
      props.onInputResult?.(result);
      if (result.status === "valid") props.onNumberChange?.(result.value);
      else if (result.status === "empty") props.onNumberChange?.(undefined);
    },
    onInvalidChange: props.onInvalidChange,
    onBlur: props.onBlur,
    formControl: props.formControl,
    fieldName: props.fieldName,
    label: props.label,
    focus,
  });
  const parsedValue = input.result.status === "valid" ? input.result.value : undefined;
  return {
    ...input,
    parsedValue,
    adjust: (direction: -1 | 1) => {
      if (parsedValue === undefined || props.adjustmentStep === undefined) return;
      input.adjust(
        nudgeNumberByStep(parsedValue, direction, {
          min,
          max,
          step: props.adjustmentStep,
          anchor: props.stepAnchor ?? 0,
        }),
      );
    },
  };
}
