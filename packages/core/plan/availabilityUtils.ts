export interface AvailabilityDayLike {
  day: string;
  windows: Array<unknown>;
  max_sessions?: number;
}

export interface CountAvailableTrainingDaysInput {
  availabilityDays: AvailabilityDayLike[];
  hardRestDays: string[];
  requirePositiveMaxSessions?: boolean;
}

/**
 * Counts unique training days with at least one availability window,
 * excluding hard-rest days.
 *
 * When `requirePositiveMaxSessions` is true, a day only counts when
 * `max_sessions` is greater than zero.
 */
export function countAvailableTrainingDays(
  input: CountAvailableTrainingDaysInput,
): number {
  const requirePositiveMaxSessions = input.requirePositiveMaxSessions ?? false;

  const availableDays = new Set(
    input.availabilityDays
      .filter((day) => {
        if (day.windows.length === 0) {
          return false;
        }

        if (requirePositiveMaxSessions) {
          return (day.max_sessions ?? 0) > 0;
        }

        return true;
      })
      .map((day) => day.day),
  );

  for (const restDay of input.hardRestDays) {
    availableDays.delete(restDay);
  }

  return availableDays.size;
}
