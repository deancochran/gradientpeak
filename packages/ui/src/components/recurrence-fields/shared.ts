import type { WeeklyCountRecurrence } from "@repo/core/recurrence";

export interface RecurrenceFieldsProps {
  value: WeeklyCountRecurrence;
  onChange: (value: WeeklyCountRecurrence) => void;
  disabled?: boolean;
  error?: string;
  testIdPrefix?: string;
}

export function getRecurrenceFieldTestIds(prefix = "recurrence") {
  return {
    toggle: `${prefix}-repeat-weekly-toggle`,
    decrement: `${prefix}-repeat-count-decrement`,
    increment: `${prefix}-repeat-count-increment`,
    count: `${prefix}-repeat-count`,
    error: `${prefix}-repeat-error`,
  } as const;
}
