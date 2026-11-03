import { ianaTimezoneSchema } from "@repo/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const coachingAccessInputSchema = z
  .object({
    organizationId: z.string().uuid(),
  })
  .strict();

const myOrganizationsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50),
    cursor: z.string().min(1).max(1024).nullable(),
  })
  .strict();

const createOrganizationInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(120),
    timezone: ianaTimezoneSchema,
  })
  .strict();

const organizationOverviewInputSchema = z.object({ organizationId: z.string().uuid() }).strict();

async function createRequestApiCaller() {
  const [{ appRouter, createApiContext }, { resolveAuthSessionFromHeaders }, { db }] =
    await Promise.all([
      import("@repo/api/server"),
      import("@repo/auth/server"),
      import("@repo/db/client"),
    ]);
  const headers = getRequestHeaders();
  const session = await resolveAuthSessionFromHeaders(headers);
  const context = await createApiContext({
    headers,
    auth: { session },
    db,
  });

  return appRouter.createCaller(context);
}

export const loadOrganizationCoachingAccess = createServerFn({ method: "POST" })
  .validator((input: unknown) => coachingAccessInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();

    return caller.organizations.coachingAccess(data);
  });

export const loadMyOrganizations = createServerFn({ method: "POST" })
  .validator((input: unknown) => myOrganizationsInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();

    return caller.organizations.listMine(data);
  });

export const createCoachingOrganization = createServerFn({ method: "POST" })
  .validator((input: unknown) => createOrganizationInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();

    return caller.organizations.create(data);
  });

/**
 * This server boundary deliberately asks the API for the actor's current capability
 * before loading administrative lists. The organization ID remains part of the route
 * identity; no organization result is retained in a client-side global selection.
 */
export const loadOrganizationManagementOverview = createServerFn({ method: "POST" })
  .validator((input: unknown) => organizationOverviewInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();
    const capabilities = await caller.organizations.managementCapabilities(data);

    if (capabilities.status === "forbidden") return { status: "forbidden" as const };

    const canReadAdministrativeRoster = capabilities.operations.some(
      (decision) =>
        decision.operation === "read_administrative_roster" && decision.outcome === "eligible",
    );

    if (!canReadAdministrativeRoster) {
      return {
        status: "granted" as const,
        canReadAdministrativeRoster,
        staff: null,
        athletes: null,
      };
    }

    try {
      const [staff, athletes] = await Promise.all([
        caller.organizations.lifecycle.staff.list({ ...data, limit: 20, cursor: null }),
        caller.organizations.lifecycle.adminRoster.list({ ...data, limit: 20, cursor: null }),
      ]);

      return {
        status: "granted" as const,
        canReadAdministrativeRoster,
        staff,
        athletes,
      };
    } catch (error) {
      // Membership can change between the capability decision and either roster read.
      // Preserve the fail-closed organization boundary instead of rendering a generic error.
      if (isForbiddenError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

function isForbiddenError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FORBIDDEN"
  );
}
