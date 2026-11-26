import { splitDurationSeconds } from "@repo/core/utils/fitness-inputs";
import { type Ref, useId, useImperativeHandle, useRef } from "react";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import type { SegmentedDurationValueProps } from "./shared";
import { useDurationSegments } from "./use-duration-segments";

export {
  type DurationSegments,
  formatDurationSeconds,
  parseDurationSegments,
  splitDurationSeconds,
} from "./shared";
export interface SegmentedDurationFieldProps extends SegmentedDurationValueProps {
  ref?: Ref<{ focus: () => void }> | undefined;
}
export function SegmentedDurationField(props: SegmentedDurationFieldProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const label = props.label ?? "Duration";
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focus = () => inputs.current.get(input.firstInvalid)?.focus({ preventScroll: true });
  const input = useDurationSegments(props, focus);
  useImperativeHandle(props.ref, () => ({ focus }));
  const error =
    input.precisionError ??
    props.error ??
    (input.invalid
      ? props.maxSeconds === 86400
        ? "Enter whole time segments totaling 1 second to 24 hours."
        : `Enter a valid ${label.toLowerCase()}. ${input.hint}`
      : undefined);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        {input.keys.map((part) => (
          <div key={part} className="min-w-0 flex-1 space-y-1">
            <label htmlFor={`${id}-${part}`} className="block text-sm font-medium">
              {part === "hours" ? "Hours" : part === "minutes" ? "Minutes" : "Seconds"}
            </label>
            <Input
              id={`${id}-${part}`}
              ref={(handle) => {
                if (handle) inputs.current.set(part, handle);
                else inputs.current.delete(part);
              }}
              aria-label={`${label} ${part}`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              className="h-12 min-w-0"
              type="text"
              inputMode="numeric"
              disabled={props.disabled || props.active === false}
              value={input.draft[part]}
              onBlur={input.blur}
              onChange={(event) => input.change(part, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (
                  (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
                  input.result.status !== "valid"
                )
                  return;
                event.preventDefault();
                const next =
                  input.result.value +
                  (event.key === "ArrowUp" ? 1 : -1) *
                    (part === "hours" ? 3600 : part === "minutes" ? 60 : 1);
                if (
                  next < (props.minSeconds ?? 1) ||
                  next > (props.maxSeconds ?? Number.MAX_SAFE_INTEGER)
                )
                  return;
                const parts = splitDurationSeconds(next, props.layout);
                input.replace(parts);
              }}
            />
          </div>
        ))}
      </div>
      {!(props.required ?? true) && input.result.status === "empty" ? (
        <p className="text-xs text-muted-foreground">Not set</p>
      ) : null}
      {!(props.required ?? true) && input.result.status !== "empty" ? (
        <Button
          type="button"
          variant="ghost"
          disabled={props.disabled}
          onClick={input.clear}
          aria-label={`Clear ${label}`}
        >
          Clear
        </Button>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
