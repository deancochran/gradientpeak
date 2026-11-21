import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const organizationId = z.string().uuid();
const groupId = z.string().uuid();
const ids = z.object({ organizationId, groupId }).strict();
const page = z
  .object({ limit: z.number().int().min(1).max(50), cursor: z.string().uuid().nullable() })
  .strict();
const listInput = ids
  .extend({
    linkCursor: z.string().uuid().nullable(),
    candidateCursor: z.string().uuid().nullable(),
  })
  .merge(z.object({ limit: z.number().int().min(1).max(50) }))
  .strict();
const coachPageInput = ids.merge(page).strict();
const assignInput = ids
  .extend({ linkId: z.string().uuid(), membershipId: z.string().uuid() })
  .strict();
const removeInput = ids.extend({ linkId: z.string().uuid() }).strict();

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
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return code === "FORBIDDEN" || code === "NOT_FOUND" || code === "UNAUTHORIZED";
}

/**
 * Reads each child concern through the request-bound API caller. `get` is an
 * independent active-group check; the staff DTO is the existing scoped source
 * for discoverable coaches and its role keys reflect effective grants.
 */
export const loadOrganizationGroupCoaches = createServerFn({ method: "POST" })
  .validator((input: unknown) => listInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      await caller.organizations.organizationGroups.get({
        organizationId: data.organizationId,
        groupId: data.groupId,
      });
      const [links, staff] = await Promise.all([
        caller.organizations.organizationGroups.coaches.list({
          organizationId: data.organizationId,
          groupId: data.groupId,
          limit: data.limit,
          cursor: data.linkCursor,
        }),
        caller.organizations.lifecycle.staff.list({
          organizationId: data.organizationId,
          limit: data.limit,
          cursor: data.candidateCursor,
        }),
      ]);
      return {
        status: "granted" as const,
        links,
        candidates: {
          items: staff.items
            .filter((member) => member.roleKeys.includes("coach"))
            .map((member) => ({
              membershipId: member.membershipId,
              label:
                member.identity.displayName ?? member.identity.username ?? "Organization coach",
            })),
          nextCursor: staff.nextCursor,
          hasMore: staff.hasMore,
        },
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

/** Loads one assigned-coach page; component pagination never collects the full organization. */
export const loadOrganizationGroupCoachLinks = createServerFn({ method: "POST" })
  .validator((input: unknown) => coachPageInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      await caller.organizations.organizationGroups.get({
        organizationId: data.organizationId,
        groupId: data.groupId,
      });
      return {
        status: "granted" as const,
        page: await caller.organizations.organizationGroups.coaches.list(data),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

/** Loads one scoped staff page and exposes only members with an effective coach grant. */
export const loadOrganizationGroupCoachCandidates = createServerFn({ method: "POST" })
  .validator((input: unknown) => coachPageInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      await caller.organizations.organizationGroups.get({
        organizationId: data.organizationId,
        groupId: data.groupId,
      });
      const staff = await caller.organizations.lifecycle.staff.list({
        organizationId: data.organizationId,
        limit: data.limit,
        cursor: data.cursor,
      });
      return {
        status: "granted" as const,
        page: {
          items: staff.items
            .filter((member) => member.roleKeys.includes("coach"))
            .map((member) => ({
              membershipId: member.membershipId,
              label:
                member.identity.displayName ?? member.identity.username ?? "Organization coach",
            })),
          nextCursor: staff.nextCursor,
          hasMore: staff.hasMore,
        },
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const assignOrganizationGroupCoach = createServerFn({ method: "POST" })
  .validator((input: unknown) => assignInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return await caller.organizations.organizationGroups.coaches.assign(data);
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const removeOrganizationGroupCoach = createServerFn({ method: "POST" })
  .validator((input: unknown) => removeInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return await caller.organizations.organizationGroups.coaches.remove(data);
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
