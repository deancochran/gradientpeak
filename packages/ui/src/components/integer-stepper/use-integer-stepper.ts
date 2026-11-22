import { clampInteger } from "@repo/core/utils/fitness-inputs";
import { parseNumericInput } from "@repo/core/utils/numeric-ux-policy";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import type { IntegerStepperProps } from "./shared";

export function useIntegerStepper(props: IntegerStepperProps, focus: () => void) {
  const { min = 0, max = 20, required = true, step = 1 } = props;
  const input = useSemanticInput({
    value:
      props.exactDraft ??
      (props.value == null || !Number.isFinite(props.value) ? "" : String(props.value)),
    identity: props.resetKey,
    disabled: props.disabled,
    required,
    parse: (raw) => parseNumericInput(raw, { min, max, precision: "integer" }),
    onText: props.onDraftChange,
    onResult: (result) => {
      props.onInputResult?.(result);
      if (result.status === "valid") props.onChange(result.value);
    },
    onBlur: props.onBlur,
    onInvalidChange: props.onInvalidChange,
    focus,
    formControl: props.formControl,
    fieldName: props.fieldName,
    label: props.label,
  });
  const currentValue = input.result.status === "valid" ? input.result.value : undefined;
  const normalizedStep = Number.isInteger(step) && step > 0 ? step : 1;
  const invalid =
    input.result.status === "invalid" || (required && input.result.status === "empty");
  const decrease =
    currentValue === undefined ? undefined : clampInteger(currentValue - normalizedStep, min, max);
  const increase =
    currentValue === undefined ? undefined : clampInteger(currentValue + normalizedStep, min, max);
  return {
    ...input,
    currentValue,
    invalid,
    decreaseDisabled: Boolean(
      props.disabled || decrease === undefined || decrease === currentValue,
    ),
    increaseDisabled: Boolean(
      props.disabled || increase === undefined || increase === currentValue,
    ),
    decrease: () => {
      if (decrease !== undefined) input.adjust(decrease);
    },
    increase: () => {
      if (increase !== undefined) input.adjust(increase);
    },
  };
}
