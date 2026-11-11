"use client";

import {
  WEEKLY_RECURRENCE_MAX_OCCURRENCES,
  WEEKLY_RECURRENCE_MIN_OCCURRENCES,
} from "@repo/core/recurrence";
import { useId } from "react";
import { Button } from "../button/index.web";
import { Switch } from "../switch/index.web";
import { getRecurrenceFieldTestIds, type RecurrenceFieldsProps } from "./shared";

function RecurrenceFields({
  disabled = false,
  error,
  onChange,
  testIdPrefix,
  value,
}: RecurrenceFieldsProps) {
  const generatedId = useId();
  const switchId = `${generatedId}-weekly`;
  const descriptionId = `${generatedId}-description`;
  const errorId = `${generatedId}-error`;
  const testIds = getRecurrenceFieldTestIds(testIdPrefix);

  const changeCount = (nextCount: number) => {
    onChange({
      ...value,
      occurrenceCount: Math.min(
        WEEKLY_RECURRENCE_MAX_OCCURRENCES,
        Math.max(WEEKLY_RECURRENCE_MIN_OCCURRENCES, nextCount),
      ),
    });
  };

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="grid flex-1 gap-1">
          <label className="text-sm font-medium text-foreground" htmlFor={switchId}>
            Repeat weekly
          </label>
          <p className="text-xs text-muted-foreground" id={descriptionId}>
            Repeats weekly on the selected day.
          </p>
        </div>
        <Switch
          accessibilityLabel="Repeat weekly"
          aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={!!error}
          checked={value.enabled}
          disabled={disabled}
          id={switchId}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          testId={testIds.toggle}
        />
      </div>

      {value.enabled ? (
        <div className="grid gap-2 border-t border-border pt-3">
          <p
            aria-live="polite"
            className="text-xs font-medium text-muted-foreground"
            data-testid={testIds.count}
          >
            Ends after {value.occurrenceCount} occurrences
          </p>
          <div className="flex gap-2">
            <Button
              accessibilityLabel="Decrease occurrence count"
              disabled={disabled || value.occurrenceCount <= WEEKLY_RECURRENCE_MIN_OCCURRENCES}
              onClick={() => changeCount(value.occurrenceCount - 1)}
              size="sm"
              testId={testIds.decrement}
              type="button"
              variant="outline"
            >
              -
            </Button>
            <Button
              accessibilityLabel="Increase occurrence count"
              disabled={disabled || value.occurrenceCount >= WEEKLY_RECURRENCE_MAX_OCCURRENCES}
              onClick={() => changeCount(value.occurrenceCount + 1)}
              size="sm"
              testId={testIds.increment}
              type="button"
              variant="outline"
            >
              +
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="text-xs text-destructive"
          id={errorId}
          role="alert"
          data-testid={testIds.error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type { RecurrenceFieldsProps } from "./shared";
export { RecurrenceFields };
