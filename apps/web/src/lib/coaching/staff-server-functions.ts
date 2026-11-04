import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const organizationIdSchema = z.string().uuid();

const staffPageInputSchema = z
  .object({
    organizationId: organizationIdSchema,
    limit: z.number().int().min(1).max(50),
    cursor: z.string().uuid().nullable(),
  })
  .strict();

const endMembershipInputSchema = z
  .object({
    organizationId: organizationIdSchema,
    membershipId: z.string().uuid(),
    reason: z.literal("staff_departure"),
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
  const context = await createApiContext({ headers, auth: { session }, db });

  return appRouter.createCaller(context);
}

function isAccessLostError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "FORBIDDEN" ||
      (error as { code?: unknown }).code === "UNAUTHORIZED")
  );
}

/**
 * The lifecycle API remains the authority for every page read. A route must not
 * reuse a roster response belonging to another organization after navigation.
 */
export const loadOrganizationStaff = createServerFn({ method: "POST" })
  .validator((input: unknown) => staffPageInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();
    try {
      const page = await caller.organizations.lifecycle.staff.list(data);
      return { status: "granted" as const, page };
    } catch (error) {
      if (isAccessLostError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

/** The API validates current authorization and terminal-operation idempotency. */
export const endOrganizationStaffMembership = createServerFn({ method: "POST" })
  .validator((input: unknown) => endMembershipInputSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await createRequestApiCaller();
    try {
      return {
        status: "ended" as const,
        result: await caller.organizations.lifecycle.endMembership(data),
      };
    } catch (error) {
      if (isAccessLostError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
