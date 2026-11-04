import { clampNumber, formatNumberForInput } from "@repo/core/utils/fitness-inputs";
import { parseNumericInput } from "@repo/core/utils/numeric-ux-policy";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import type { PercentSliderInputProps } from "./shared";

export function usePercentSliderInput(props: PercentSliderInputProps, focus: () => void) {
  const { value, min = 0, max = 20, decimals = 2 } = props;
  const display = value == null ? "" : formatNumberForInput(value, decimals);
  const input = useSemanticInput({
    value: display,
    identity: props.resetKey,
    disabled: props.disabled,
    required: props.required,
    parse: (raw) => {
      const result = parseNumericInput(raw, { min, max, precision: props.precision ?? "decimal" });
      // Formatting the current canonical value is not an edit to that value.
      return result.status === "valid" && value != null && result.value === Number(display)
        ? { status: "valid", value }
        : result;
    },
    echoes: (result) => [
      result.status === "valid" ? formatNumberForInput(result.value, decimals) : "",
    ],
    onResult: (result) => {
      props.onInputResult?.(result);
      if (result.status === "valid") props.onChange(result.value);
    },
    onBlur: props.onBlur,
    onInvalidChange: props.onInvalidChange,
    formControl: props.formControl,
    fieldName: props.fieldName,
    label: props.label,
    focus,
  });
  const sliderStep = props.step ?? 0.25;
  // The thumb is a stepped preview. Never feed its display projection back to the canonical value.
  const sliderValue =
    typeof value === "number" && Number.isFinite(value)
      ? clampNumber(min + Math.round((value - min) / sliderStep) * sliderStep, min, max)
      : min;
  return {
    ...input,
    display,
    sliderValue,
    slide: (next: number) => input.adjust(Number(clampNumber(next, min, max).toFixed(decimals))),
  };
}
