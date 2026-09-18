import { type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import {
  type DurationSegments,
  parseDurationSegments,
  type SegmentedDurationValueProps,
  splitDurationSeconds,
} from "./shared";

export {
  type DurationSegments,
  formatDurationSeconds,
  parseDurationSegments,
  splitDurationSeconds,
} from "./shared";
export interface SegmentedDurationFieldProps extends SegmentedDurationValueProps {
  ref?: Ref<{ focus: () => void }>;
}

export function SegmentedDurationField({
  ref,
  valueSeconds,
  onChangeSeconds,
  onInvalidChange,
  segments,
  onSegmentsChange,
  label = "Duration",
  id,
  disabled = false,
}: SegmentedDurationFieldProps) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const lastEmitted = useRef(valueSeconds);
  const [local, setLocal] = useState(() => splitDurationSeconds(valueSeconds));
  const draft =
    segments ?? (valueSeconds !== lastEmitted.current ? splitDurationSeconds(valueSeconds) : local);
  const [hoursRequested, setHoursRequested] = useState(false);
  const showHours = hoursRequested || draft.hours !== "0";
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const lastEdited = useRef<keyof DurationSegments>("minutes");
  const invalid = parseDurationSegments(draft) === null;
  const reportedInvalid = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (reportedInvalid.current === invalid) return;
    reportedInvalid.current = invalid;
    onInvalidChange(invalid);
  }, [invalid, onInvalidChange]);
  useEffect(() => {
    if (valueSeconds !== lastEmitted.current) {
      setLocal(splitDurationSeconds(valueSeconds));
      lastEmitted.current = valueSeconds;
    }
  }, [valueSeconds]);
  useImperativeHandle(ref, () => ({
    focus: () => {
      const bad = (Object.keys(draft) as (keyof DurationSegments)[]).find(
        (part) => !/^\d+$/.test(draft[part]) || (part !== "hours" && Number(draft[part]) > 59),
      );
      inputs.current
        .get(bad ?? (invalid ? lastEdited.current : "minutes"))
        ?.focus({ preventScroll: true });
    },
  }));
  const change = (next: DurationSegments) => {
    setLocal(next);
    onSegmentsChange?.(next);
    const seconds = parseDurationSegments(next);
    if (seconds !== null) {
      lastEmitted.current = seconds;
      onChangeSeconds(seconds);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        {(["hours", "minutes", "seconds"] as const)
          .filter((part) => part !== "hours" || showHours)
          .map((part) => (
            <div key={part} className="min-w-0 flex-1 space-y-1">
              <label htmlFor={`${baseId}-${part}`} className="block text-sm font-medium">
                {part[0]?.toUpperCase()}
                {part.slice(1)}
              </label>
              <Input
                id={`${baseId}-${part}`}
                ref={(input) => {
                  if (input) inputs.current.set(part, input);
                  else inputs.current.delete(part);
                }}
                aria-label={`${label} ${part}`}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${baseId}-error` : undefined}
                className="h-12 min-w-0"
                type="text"
                inputMode="numeric"
                disabled={disabled}
                value={draft[part]}
                onChange={(event) => {
                  lastEdited.current = part;
                  change({ ...draft, [part]: event.currentTarget.value });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  const seconds = parseDurationSegments(draft);
                  if (seconds === null) return;
                  event.preventDefault();
                  const next =
                    seconds +
                    (event.key === "ArrowUp" ? 1 : -1) *
                      (part === "hours" ? 3600 : part === "minutes" ? 60 : 1);
                  if (next >= 1 && next <= 86400) {
                    lastEdited.current = part;
                    change(splitDurationSeconds(next));
                  }
                }}
              />
            </div>
          ))}
      </div>
      {!showHours ? (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => setHoursRequested(true)}
        >
          Add hours
        </Button>
      ) : null}
      {invalid ? (
        <p id={`${baseId}-error`} role="alert" className="text-sm text-destructive">
          Enter whole time segments totaling 1 second to 24 hours.
        </p>
      ) : null}
    </div>
  );
}
