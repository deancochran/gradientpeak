import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const organizationIdSchema = z.string().uuid();

const staffPageInputSchema = z
  .object({
    organizationId: organizationIdSchema,
    status: z.enum(["active", "suspended"]),
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

const staffSuspensionInputSchema = z
  .object({
    organizationId: organizationIdSchema,
    membershipId: z.string().uuid(),
    operationId: z.string().uuid(),
    // The current API validates a normalized reason code rather than publishing
    // a closed enum. Keep the web command explicit and stable for idempotent retry.
    reason: z.literal("administrative_review"),
  })
  .strict();

const staffRoleInputSchema = z
  .object({
    organizationId: organizationIdSchema,
    membershipId: z.string().uuid(),
    role: z.enum(["admin", "coach"]),
    operationId: z.string().uuid(),
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

export const suspendOrganizationStaffMembership = createServerFn({ method: "POST" })
  .validator((input: unknown) => staffSuspensionInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await createRequestApiCaller()).organizations.lifecycle.suspendMembership(data);
    } catch (error) {
      if (isAccessLostError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
export const resumeOrganizationStaffMembership = createServerFn({ method: "POST" })
  .validator((input: unknown) => staffSuspensionInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await createRequestApiCaller()).organizations.lifecycle.resumeMembership(data);
    } catch (error) {
      if (isAccessLostError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
export const grantOrganizationStaffRole = createServerFn({ method: "POST" })
  .validator((input: unknown) => staffRoleInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await createRequestApiCaller()).organizations.staffRoles.grant(data);
    } catch (error) {
      if (isAccessLostError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
export const revokeOrganizationStaffRole = createServerFn({ method: "POST" })
  .validator((input: unknown) => staffRoleInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await createRequestApiCaller()).organizations.staffRoles.revoke(data);
    } catch (error) {
      if (isAccessLostError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
