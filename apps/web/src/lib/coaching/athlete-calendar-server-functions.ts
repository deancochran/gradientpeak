import { addDaysDateOnlyUtc, formatDateOnlyUtc, parseDateOnlyUtc } from "@repo/core/calendar";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const inputSchema = z
  .object({
    athleteProfileId: z.string().uuid(),
    cursor: z.object({ eventId: z.string().uuid(), planningDate: dateOnly }).nullable(),
    endDateExclusive: dateOnly,
    organizationId: z.string().uuid(),
    startDate: dateOnly,
  })
  .strict();

async function caller() {
  const [
    { appRouter, createApiContext },
    { resolveAuthSessionFromHeaders },
    { db },
    { getRequestHeaders },
  ] = await Promise.all([
    import("@repo/api/server"),
    import("@repo/auth/server"),
    import("@repo/db/client"),
    import("@tanstack/react-start/server"),
  ]);
  const headers = getRequestHeaders();
  return appRouter.createCaller(
    await createApiContext({
      headers,
      auth: { session: await resolveAuthSessionFromHeaders(headers) },
      db,
    }),
  );
}
function access(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].includes(String((error as { code?: unknown }).code))
  );
}

/** Request identity supplies the actor; callers may bind only org, athlete, range, and continuation. */
export const loadCoachAthleteCalendar = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "granted" as const,
        ...(await (await caller()).calendar.coachAthleteRange({ ...data, limit: 28 })),
      };
    } catch (error) {
      if (access(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export function currentCalendarWeek() {
  const startDate = formatDateOnlyUtc(parseDateOnlyUtc(new Date().toISOString().slice(0, 10)));
  return { startDate, endDateExclusive: addDaysDateOnlyUtc(startDate, 7) };
}

/** Shifts an already validated seven-day, date-only display range without local-time conversion. */
export function shiftCalendarWeek(
  range: { startDate: string; endDateExclusive: string },
  direction: -1 | 1,
) {
  return {
    startDate: addDaysDateOnlyUtc(range.startDate, direction * 7),
    endDateExclusive: addDaysDateOnlyUtc(range.endDateExclusive, direction * 7),
  };
}
