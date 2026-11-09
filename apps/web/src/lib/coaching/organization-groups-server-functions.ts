import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const organizationId = z.string().uuid();
const groupId = z.string().uuid();
const pageInputSchema = z
  .object({ organizationId, limit: z.number().int().min(1).max(50), cursor: groupId.nullable() })
  .strict();
const groupInputSchema = z.object({ organizationId, groupId }).strict();
const createInputSchema = groupInputSchema
  .extend({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable(),
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
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return code === "FORBIDDEN" || code === "NOT_FOUND" || code === "UNAUTHORIZED";
}

/** Request-bound group administration. The API remains authoritative for tenant access and idempotency. */
export const loadOrganizationGroups = createServerFn({ method: "POST" })
  .validator((input: unknown) => pageInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        status: "granted" as const,
        ...(await caller.organizations.organizationGroups.list(data)),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const loadOrganizationGroup = createServerFn({ method: "POST" })
  .validator((input: unknown) => groupInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        status: "granted" as const,
        group: await caller.organizations.organizationGroups.get(data),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const createOrganizationGroup = createServerFn({ method: "POST" })
  .validator((input: unknown) => createInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        ...(await caller.organizations.organizationGroups.create(data)),
        status: "created" as const,
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const archiveOrganizationGroup = createServerFn({ method: "POST" })
  .validator((input: unknown) => groupInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        ...(await caller.organizations.organizationGroups.archive(data)),
        status: "archived" as const,
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
