import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const inputSchema = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.number().int().min(1).max(50),
    cursor: z.string().min(1).max(2048).nullable(),
    action: z.string().trim().min(1).max(160).nullable(),
    actorProfileId: z.string().uuid().nullable(),
    resourceType: z.string().trim().min(1).max(160).nullable(),
    resourceId: z.string().uuid().nullable(),
    fromInclusive: z.coerce.date().nullable(),
    toExclusive: z.coerce.date().nullable(),
  })
  .strict();

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
  return code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND";
}

/** The API rechecks active administrative authority for every history request. */
export const loadOrganizationAuditHistory = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "granted" as const,
        page: await (await caller()).organizations.auditHistory.list(data),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });
