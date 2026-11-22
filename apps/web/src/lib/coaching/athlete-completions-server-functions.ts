import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z
  .object({ athleteProfileId: z.string().uuid(), organizationId: z.string().uuid() })
  .strict();
const acknowledgeInputSchema = inputSchema.extend({
  evidenceVersion: z.string().min(1).max(128),
  sessionId: z.string().uuid(),
});

function isAccessError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].includes(String((error as { code?: unknown }).code))
  );
}

/** Request identity supplies the coach; the API proves calendar and activities consent. */
export const loadCoachAthleteCompletedActivities = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
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
      const caller = appRouter.createCaller(
        await createApiContext({
          headers,
          auth: { session: await resolveAuthSessionFromHeaders(headers) },
          db,
        }),
      );
      return {
        status: "granted" as const,
        ...(await caller.calendar.coachAthleteCompletedActivities({ ...data, limit: 20 })),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const acknowledgeCoachAthleteCompletedActivity = createServerFn({ method: "POST" })
  .validator((input: unknown) => acknowledgeInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
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
      const caller = appRouter.createCaller(
        await createApiContext({
          headers,
          auth: { session: await resolveAuthSessionFromHeaders(headers) },
          db,
        }),
      );
      return caller.calendar.acknowledgeCoachAthleteCompletedActivity(data);
    } catch (error) {
      if (isAccessError(error)) return { outcome: "forbidden" as const };
      throw error;
    }
  });
