import { formatSecondsToMmSs, parseMmSsToSeconds } from "@repo/core/utils/fitness-inputs";
import type { NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
import { useFormDraftResetKey } from "../../hooks/pending-form-drafts";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import type { PaceSecondsFieldProps } from "./shared";

function formatValue(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "" : formatSecondsToMmSs(value);
}

export function usePaceSecondsField(props: PaceSecondsFieldProps) {
  const reset = useFormDraftResetKey(props.formControl);
  const display = formatValue(props.valueSeconds);
  const parse = (raw: string): NumericInputResult => {
    if (!raw.trim()) return { status: "empty" };
    const value = parseMmSsToSeconds(raw);
    if (value === undefined || !Number.isFinite(value) || value <= 0)
      return { status: "invalid", reason: "syntax" };
    return {
      status: "valid",
      value: raw.trim() === display && props.valueSeconds != null ? props.valueSeconds : value,
    };
  };
  const input = useSemanticInput({
    value: display,
    identity: `${props.resetKey ?? ""}:${reset}`,
    disabled: props.disabled,
    required: props.required,
    formControl: props.formControl,
    fieldName: props.fieldName,
    label: props.label,
    parse,
    onBlur: props.onBlur,
    onResult: (result) => {
      props.onInputResult?.(result);
      props.onChangeSeconds(
        result.status === "valid" ? result.value : result.status === "empty" ? null : Number.NaN,
      );
    },
    echoes: (result) => [result.status === "valid" ? formatValue(result.value) : ""],
  });
  return {
    draftValue: input.text,
    onBlur: input.blur,
    onChange: input.change,
    adjust: (direction: -1 | 1) => {
      if (input.result.status !== "valid") return;
      input.change(formatSecondsToMmSs(Math.max(1, input.result.value + direction * 5)));
    },
  };
}
