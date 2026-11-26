import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  OrganizationAuditHistoryError,
  readOrganizationAuditHistory,
} from "../application/organizations/read-organization-audit-history";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const listInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(2048).nullable().default(null),
    action: z.string().trim().min(1).max(160).nullable().default(null),
    actorProfileId: z.string().uuid().nullable().default(null),
    resourceType: z.string().trim().min(1).max(160).nullable().default(null),
    resourceId: z.string().uuid().nullable().default(null),
    fromInclusive: z.coerce.date().nullable().default(null),
    toExclusive: z.coerce.date().nullable().default(null),
  })
  .strict();

const eventOutputSchema = z
  .object({
    eventId: z.string().uuid(),
    occurredAt: z.date(),
    actor: z
      .object({
        profileId: z.string().uuid(),
        displayName: z.string().nullable(),
        username: z.string().nullable(),
      })
      .strict()
      .nullable(),
    action: z.string(),
    resource: z.object({ type: z.string(), id: z.string().uuid().nullable() }).strict(),
    details: z.enum(["none", "redacted"]),
  })
  .strict();

const pageOutputSchema = z
  .object({
    items: z.array(eventOutputSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .strict();

function fail(error: unknown): never {
  if (error instanceof OrganizationAuditHistoryError)
    throw new TRPCError({
      code: error.reason === "forbidden" ? "FORBIDDEN" : "BAD_REQUEST",
      message: "Organization audit history could not be read",
      cause: error,
    });
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Organization audit history request failed",
    cause: error,
  });
}

export const organizationAuditHistoryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(listInputSchema)
    .output(pageOutputSchema)
    .query(({ ctx, input }) =>
      readOrganizationAuditHistory({
        db: getRequiredDb(ctx),
        actorProfileId: ctx.session.user.id,
        organizationId: input.organizationId,
        limit: input.limit,
        cursor: input.cursor,
        action: input.action,
        auditActorProfileId: input.actorProfileId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        fromInclusive: input.fromInclusive,
        toExclusive: input.toExclusive,
      }).catch(fail),
    ),
});
