import {
  type DurationSegments,
  durationPrecisionMessage,
  durationSegmentKeys,
  durationSegmentsSchema,
  formatDurationSeconds,
  parseDurationSegmentInput,
  splitDurationSeconds,
} from "@repo/core/utils/fitness-inputs";
import { useEffect, useRef } from "react";
import { useFormDraftResetKey } from "../../hooks/pending-form-drafts";
import { useSemanticInput } from "../../hooks/use-semantic-input";
import type { SegmentedDurationValueProps } from "./shared";

const decode = (text: string) => durationSegmentsSchema.parse(JSON.parse(text));
export function useDurationSegments(props: SegmentedDurationValueProps, focus: () => void) {
  const formReset = useFormDraftResetKey(props.formControl);
  const keys = durationSegmentKeys(props.layout);
  const lastEdited =
    useRef<keyof Pick<DurationSegments, "hours" | "minutes" | "seconds">>("minutes");
  const echo = useRef("");
  const reported = useRef<boolean | undefined>(undefined);
  const input = useSemanticInput({
    value: JSON.stringify(props.segments ?? splitDurationSeconds(props.valueSeconds, props.layout)),
    identity: JSON.stringify([
      props.resetKey,
      formReset,
      props.layout,
      props.segments !== undefined,
    ]),
    disabled: props.disabled || props.active === false || (props.isCurrent && !props.isCurrent()),
    required: props.required ?? true,
    formControl: props.formControl,
    fieldName: props.fieldName,
    label: props.label ?? "duration",
    focus,
    parse: (text) => parseDurationSegmentInput(decode(text), props),
    onText: (text) => props.onSegmentsChange?.(decode(text)),
    onResult: (result) => {
      props.onInputResult?.(result);
      if (result.status === "valid") props.onChangeSeconds(result.value);
      else if (result.status === "empty") props.onEmpty?.();
    },
    echoes: (result) => [
      echo.current,
      JSON.stringify(
        splitDurationSeconds(
          result.status === "valid" ? result.value : result.status === "empty" ? null : Number.NaN,
          props.layout,
        ),
      ),
    ],
    onInvalidChange: (invalid) => {
      reported.current = invalid;
      props.onInvalidChange(invalid);
    },
    onBlur: props.onBlur,
  });
  const draft = decode(input.text);
  const current = useRef(draft);
  current.current = draft;
  const invalid =
    input.result.status === "invalid" ||
    ((props.required ?? true) && input.result.status === "empty");
  // Keep the original mounted-validity report for step editors and restored snapshots.
  useEffect(() => {
    if (reported.current !== invalid) {
      reported.current = invalid;
      props.onInvalidChange(invalid);
    }
  }, [invalid, props.onInvalidChange]);
  const replace = (next: DurationSegments) => {
    if (!input.isCurrent() || (props.isCurrent && !props.isCurrent())) return;
    current.current = next;
    echo.current = JSON.stringify(next);
    input.change(echo.current);
  };
  const change = (part: typeof lastEdited.current, text: string) => {
    if (!input.isCurrent() || (props.isCurrent && !props.isCurrent())) return;
    lastEdited.current = part;
    const next: DurationSegments = {
      // A visible-unit edit is explicit correction; a layout change alone is not.
      hours: props.layout === "ms" ? "0" : current.current.hours,
      minutes: current.current.minutes,
      seconds: props.layout === "hm" ? "0" : current.current.seconds,
      [part]: text,
    };
    if (
      props.layout === "hm" &&
      current.current.invalidReason === "precision" &&
      current.current.invalidText !== undefined &&
      parseDurationSegmentInput(next, props).status === "invalid"
    ) {
      next.seconds = current.current.seconds;
      next.invalidText = current.current.invalidText;
      next.invalidReason = "precision";
    }
    replace(next);
  };
  const firstInvalid =
    keys.find(
      (key) => !/^\d+$/.test(draft[key]) && !(props.allowOmittedSegments && draft[key] === ""),
    ) ??
    keys.find(
      (key) =>
        (key === "seconds" || (key === "minutes" && props.layout !== "ms")) &&
        Number(draft[key]) > 59,
    ) ??
    (invalid ? lastEdited.current : "minutes");
  return {
    ...input,
    draft,
    keys,
    invalid,
    precisionError: durationPrecisionMessage(draft, props),
    firstInvalid,
    change,
    replace,
    clear: () => replace(splitDurationSeconds(null, props.layout)),
    hint: `Enter whole ${props.layout === "hm" ? "hours and minutes" : props.layout === "ms" ? "minutes and seconds" : "hours, minutes and seconds"}. ${props.layout === "hm" ? "Minutes" : props.layout === "ms" ? "Seconds" : "Minutes and seconds"} must be 0–59. Total ${formatDurationSeconds(props.minSeconds ?? 1)}${props.maxSeconds === undefined ? " or more" : ` to ${formatDurationSeconds(props.maxSeconds)}`}.`,
  };
}
