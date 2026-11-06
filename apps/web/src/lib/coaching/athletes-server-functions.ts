import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const organizationId = z.string().uuid();
const rosterInputSchema = z
  .object({
    organizationId,
    limit: z.number().int().min(1).max(50),
    cursor: z.string().uuid().nullable(),
  })
  .strict();
const coachDirectoryInputSchema = rosterInputSchema.extend({
  search: z.string().min(1).max(120).nullable(),
});
const endEngagementInputSchema = z
  .object({
    organizationId,
    engagementId: z.string().uuid(),
    reason: z.string().regex(/^[a-z0-9][a-z0-9_]{0,63}$/),
    correlationId: z.string().uuid(),
  })
  .strict();

async function createRequestApiCaller() {
  const [{ appRouter, createApiContext }, { resolveAuthSessionFromHeaders }, { db }] =
    await Promise.all([
      import("@repo/api/server"),
      import("@repo/auth/server"),
      import("@repo/db/client"),
    ]);
  const headers = getRequestHeaders();
  const session = await resolveAuthSessionFromHeaders(headers);
  return appRouter.createCaller(await createApiContext({ headers, auth: { session }, db }));
}

function isAccessError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "FORBIDDEN" ||
      (error as { code?: unknown }).code === "NOT_FOUND" ||
      (error as { code?: unknown }).code === "UNAUTHORIZED")
  );
}

/** A request-bound administrative read. A stale organization membership never leaks roster data. */
export const loadAdministrativeAthleteRoster = createServerFn({ method: "POST" })
  .validator((input: unknown) => rosterInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        status: "granted" as const,
        ...(await caller.organizations.lifecycle.adminRoster.list({
          organizationId: data.organizationId,
          limit: data.limit,
          cursor: data.cursor,
        })),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

/** The ordinary coaching selector is assignment-bound; administration is only a fallback page. */
export const loadOrganizationAthletesLanding = createServerFn({ method: "POST" })
  .validator((input: unknown) => coachDirectoryInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();
    try {
      return {
        status: "directory" as const,
        ...(await caller.organizations.coachAthletes.listAssigned(data)),
      };
    } catch (error) {
      if (!isAccessError(error)) throw error;
    }
    try {
      return {
        status: "administration" as const,
        ...(await caller.organizations.lifecycle.adminRoster.list({
          organizationId: data.organizationId,
          limit: data.limit,
          // Directory cursors identify profiles; roster cursors identify engagements.
          cursor: null,
        })),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const loadAssignedCoachAthletes = createServerFn({ method: "POST" })
  .validator((input: unknown) => coachDirectoryInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        status: "granted" as const,
        ...(await caller.organizations.coachAthletes.listAssigned(data)),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const loadSelectedCoachAthlete = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ organizationId, athleteProfileId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return await caller.organizations.coachAthletes.getAssigned(data);
    } catch (error) {
      if (isAccessError(error)) return null;
      throw error;
    }
  });

export const loadCoachAthleteOverview = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ organizationId, athleteProfileId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      const model = await caller.athleteIntelligence.getOrganizationReadModel({
        organizationId: data.organizationId,
        athleteProfileId: data.athleteProfileId,
        sections: { publishedState: true, status: true },
      });
      return {
        status: "granted" as const,
        model: {
          publishedState: model.publishedState
            ? {
                publishedAt: model.publishedState.publishedAt,
                baseline: model.publishedState.baseline,
                estimates: model.publishedState.estimates.map((estimate) => ({
                  activityCategory: estimate.activityCategory,
                  capabilityKind: estimate.capabilityKind,
                  value: estimate.value,
                  unit: estimate.unit,
                  confidence: estimate.confidence,
                  effectiveAt: estimate.effectiveAt,
                  computedAt: estimate.computedAt,
                  algorithmVersion: estimate.algorithmVersion,
                })),
              }
            : null,
          ...(model.status
            ? {
                status: {
                  freshness: model.status.freshness,
                  importStatus: model.status.importStatus,
                  coverage: { lastActivityAt: model.status.coverage.lastActivityAt },
                },
              }
            : {}),
        },
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "unavailable" as const };
      throw error;
    }
  });

/** The API remains authoritative for permission and idempotency; this function only binds it to the request session. */
export const terminateAthleteEngagement = createServerFn({ method: "POST" })
  .validator((input: unknown) => endEngagementInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        ...(await caller.organizations.lifecycle.endEngagement(data)),
        status: "ended" as const,
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
