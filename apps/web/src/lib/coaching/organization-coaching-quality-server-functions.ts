import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const inputSchema = z.object({ organizationId: z.string().uuid() }).strict();

async function caller() {
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

/** Request-bound aggregate read. The API remains the sole authority for assignment scope. */
export const loadOrganizationCoachingQuality = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "granted" as const,
        overview: await (await caller()).organizations.coachingQuality.overview(data),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
