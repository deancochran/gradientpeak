import {
  durationPrecisionMessage,
  durationSegmentsApiText,
  durationTextSegments,
  parseDurationSegmentInput,
} from "@repo/core/utils/fitness-inputs";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import type { DurationInputProps } from "./shared";

export function useDurationInput(props: DurationInputProps, focus: () => void) {
  const input = useSemanticInput({
    value: props.value,
    identity: props.resetKey,
    disabled: props.disabled,
    required: props.required,
    formControl: props.formControl,
    fieldName: props.fieldName,
    label: props.label,
    focus,
    parse: (raw) => parseDurationSegmentInput(durationTextSegments(raw, props.layout), props),
    onText: (raw) => props.onChange(raw),
    onResult: (result) => {
      if (result.status === "valid") props.onDurationSecondsChange?.(result.value);
      else if (result.status === "empty") props.onDurationSecondsChange?.(undefined);
    },
    onInvalidChange: props.onInvalidChange,
    onBlur: props.onBlur,
  });
  return {
    ...input,
    precisionError: durationPrecisionMessage(durationTextSegments(input.text, props.layout), props),
    blur: () => {
      const normalized = durationSegmentsApiText(
        durationTextSegments(input.text, props.layout),
        props,
        "hms",
      );
      if (input.result.status === "valid" && normalized !== input.text) input.change(normalized);
      input.blur();
    },
  };
}
