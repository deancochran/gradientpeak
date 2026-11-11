import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const inputSchema = z
  .object({ organizationId: z.string().uuid(), athleteProfileId: z.string().uuid() })
  .strict();

export type CoachAthleteBikeZones =
  inferRouterOutputs<AppRouter>["athleteIntelligence"]["getCoachAthleteBikeZones"];
export type CoachAthleteBikeZonesRead =
  | { status: "granted"; zones: CoachAthleteBikeZones }
  | { status: "forbidden" };

function isAccessError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"] as const).includes(
      (error as { code?: unknown }).code as "FORBIDDEN" | "UNAUTHORIZED" | "NOT_FOUND",
    )
  );
}

/** Request-bound only: the actor is derived from the session, never client input. */
export const loadCoachAthleteBikeZones = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<CoachAthleteBikeZonesRead> => {
    try {
      const [{ appRouter, createApiContext }, { resolveAuthSessionFromHeaders }, { db }] =
        await Promise.all([
          import("@repo/api/server"),
          import("@repo/auth/server"),
          import("@repo/db/client"),
        ]);
      const headers = getRequestHeaders();
      const session = await resolveAuthSessionFromHeaders(headers);
      const caller = appRouter.createCaller(
        await createApiContext({ headers, auth: { session }, db }),
      );
      return {
        status: "granted",
        zones: await caller.athleteIntelligence.getCoachAthleteBikeZones(data),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" };
      throw error;
    }
  });
