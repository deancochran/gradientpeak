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

export const loadOrganizationCoachingAccess = createServerFn({ method: "GET" })
  .validator((input: unknown) => coachingAccessInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();

    return caller.organizations.coachingAccess(data);
  });

export const loadMyOrganizations = createServerFn({ method: "GET" })
  .validator((input: unknown) => myOrganizationsInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();

    return caller.organizations.listMine(data);
  });
