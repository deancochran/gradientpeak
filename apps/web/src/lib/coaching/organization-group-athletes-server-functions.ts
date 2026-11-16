import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const organizationId = z.string().uuid();
const groupId = z.string().uuid();
const linkId = z.string().uuid();
const engagementId = z.string().uuid();
const page = z
  .object({ limit: z.number().int().min(1).max(50), cursor: z.string().uuid().nullable() })
  .strict();
const groupInput = z.object({ organizationId, groupId }).strict();
const groupPageInput = groupInput.merge(page);
const addInput = groupInput.extend({ linkId, engagementId }).strict();
const removeInput = groupInput.extend({ linkId }).strict();

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
  const result = z.object({ code: z.string().optional() }).passthrough().safeParse(error);
  return (
    result.success &&
    (result.data.code === "FORBIDDEN" ||
      result.data.code === "NOT_FOUND" ||
      result.data.code === "UNAUTHORIZED")
  );
}

async function activeGroupCaller(data: z.infer<typeof groupInput>) {
  const caller = await createRequestApiCaller();
  // Do not rely on the parent detail route: archived groups are denied here before roster data.
  await caller.organizations.organizationGroups.get({
    organizationId: data.organizationId,
    groupId: data.groupId,
  });
  return caller;
}

/** Request-bound group-athlete reads. API group authorization remains authoritative. */
export const loadOrganizationGroupAthleteWorkflow = createServerFn({ method: "POST" })
  .validator((input: unknown) => groupInput.merge(page).parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await activeGroupCaller(data);
      const [{ items, nextCursor, hasMore }, roster] = await Promise.all([
        caller.organizations.organizationGroups.athletes.list(data),
        caller.organizations.lifecycle.adminRoster.list({
          organizationId: data.organizationId,
          limit: data.limit,
          cursor: null,
        }),
      ]);
      return {
        status: "granted" as const,
        links: { items, nextCursor, hasMore },
        candidates: roster,
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const loadOrganizationGroupAthleteLinks = createServerFn({ method: "POST" })
  .validator((input: unknown) => groupPageInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await activeGroupCaller(data);
      return {
        status: "granted" as const,
        ...(await caller.organizations.organizationGroups.athletes.list(data)),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const loadOrganizationGroupAthleteCandidates = createServerFn({ method: "POST" })
  .validator((input: unknown) => groupPageInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await activeGroupCaller(data);
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

export const addOrganizationGroupAthlete = createServerFn({ method: "POST" })
  .validator((input: unknown) => addInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await activeGroupCaller(data);
      return caller.organizations.organizationGroups.athletes.add(data);
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const removeOrganizationGroupAthlete = createServerFn({ method: "POST" })
  .validator((input: unknown) => removeInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await activeGroupCaller(data);
      return caller.organizations.organizationGroups.athletes.remove(data);
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
