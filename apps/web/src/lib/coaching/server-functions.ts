import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const coachingAccessInputSchema = z
  .object({
    organizationId: z.string().uuid(),
  })
  .strict();

export const loadOrganizationCoachingAccess = createServerFn({ method: "GET" })
  .validator((input: unknown) => coachingAccessInputSchema.parse(input))
  .handler(async ({ data }) => {
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

    return appRouter.createCaller(context).organizations.coachingAccess(data);
  });
