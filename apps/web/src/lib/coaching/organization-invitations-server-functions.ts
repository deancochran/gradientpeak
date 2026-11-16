import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const organizationId = z.string().uuid();
const email = z.string().trim().email().max(320);
const createInvitationInputSchema = z.union([
  z
    .object({
      organizationId,
      kind: z.literal("staff"),
      requestedRole: z.enum(["admin", "coach"]),
      recipientProfileId: z.string().uuid(),
      recipientEmail: z.null(),
      expiresAt: z.coerce.date(),
    })
    .strict(),
  z
    .object({
      organizationId,
      kind: z.literal("staff"),
      requestedRole: z.enum(["admin", "coach"]),
      recipientProfileId: z.null(),
      recipientEmail: email,
      expiresAt: z.coerce.date(),
    })
    .strict(),
  z
    .object({
      organizationId,
      kind: z.literal("athlete"),
      requestedRole: z.null(),
      recipientProfileId: z.string().uuid(),
      recipientEmail: z.null(),
      expiresAt: z.coerce.date(),
    })
    .strict(),
  z
    .object({
      organizationId,
      kind: z.literal("athlete"),
      requestedRole: z.null(),
      recipientProfileId: z.null(),
      recipientEmail: email,
      expiresAt: z.coerce.date(),
    })
    .strict(),
]);
const listInvitationInputSchema = z
  .object({
    organizationId,
    limit: z.number().int().min(1).max(50),
    cursor: z.string().min(1).max(512).nullable(),
  })
  .strict();
const revokeInvitationInputSchema = z
  .object({ organizationId, invitationId: z.string().uuid() })
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
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "FORBIDDEN" ||
      (error as { code?: unknown }).code === "UNAUTHORIZED")
  );
}

/** Invitation summaries intentionally exclude recipient identity, email, and token material. */
export const loadOrganizationInvitations = createServerFn({ method: "POST" })
  .validator((input: unknown) => listInvitationInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      const [capabilities, page] = await Promise.all([
        caller.organizations.managementCapabilities({ organizationId: data.organizationId }),
        caller.organizations.invitations.listForOrganization(data),
      ]);
      if (capabilities.status === "forbidden") return { status: "forbidden" as const };
      return {
        status: "granted" as const,
        page,
        canInviteAdministrators: capabilities.isRootOwner,
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "forbidden" as const };
      throw error;
    }
  });

export const createOrganizationInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) => createInvitationInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        status: "created" as const,
        invitation: await caller.organizations.invitations.create(data),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });

export const revokeOrganizationInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) => revokeInvitationInputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const caller = await createRequestApiCaller();
      return {
        status: "revoked" as const,
        result: await caller.organizations.invitations.revoke(data),
      };
    } catch (error) {
      if (isAccessError(error)) return { status: "access_lost" as const };
      throw error;
    }
  });
