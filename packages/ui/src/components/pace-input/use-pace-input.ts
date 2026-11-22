import {
  durationSegmentsApiText,
  paceTextSegments,
  parseDurationSegmentInput,
  resolvePaceSegmentLayout,
} from "@repo/core/utils/fitness-inputs";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import type { PaceInputProps } from "./shared";

export function usePaceInput(props: PaceInputProps) {
  const layout = resolvePaceSegmentLayout(props.layout);
  const input = useSemanticInput({
    value: props.value,
    identity: props.resetKey,
    disabled: props.disabled,
    required: props.required,
    formControl: props.formControl,
    fieldName: props.fieldName,
    label: props.label,
    parse: (raw) =>
      parseDurationSegmentInput(paceTextSegments(raw, layout), {
        layout,
      }),
    onText: (raw) => props.onChange(raw),
    onResult: (result) => {
      if (result.status === "valid") props.onPaceSecondsChange?.(result.value);
      else if (result.status === "empty") props.onPaceSecondsChange?.(undefined);
    },
    onBlur: props.onBlur,
  });
  return {
    ...input,
    blur: () => {
      const normalized = durationSegmentsApiText(
        paceTextSegments(input.text, layout),
        { layout },
        "ms",
      );
      if (input.result.status === "valid" && normalized !== input.text) input.change(normalized);
      input.blur();
    },
  };
}
