import {
  organizationContextSchema,
  organizationStaffMembershipSummarySchema,
} from "@repo/core/organizations";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  decodeOrganizationListCursor,
  listMyOrganizationContexts,
  readOrganizationCoachingAccess,
  readOrganizationContext,
} from "../application/organizations/read-coaching-access";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import {
  createOrganizationAccessRepository,
  type OrganizationAccessRepository,
} from "../repositories/organization-access-repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const organizationIdInputSchema = z.object({ organizationId: z.string().uuid() }).strict();
const organizationListInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .min(1)
      .max(1024)
      .transform((value, ctx) => {
        const cursor = decodeOrganizationListCursor(value);
        if (!cursor) {
          ctx.addIssue({ code: "custom", message: "Unsupported organization cursor" });
          return z.NEVER;
        }
        return cursor;
      })
      .nullable()
      .default(null),
  })
  .strict();
const organizationIdentitySchema = z
  .object({ id: z.string().uuid(), name: z.string(), slug: z.string() })
  .strict();
const organizationMembershipContextSchema = z
  .object({
    organization: organizationContextSchema,
    membership: organizationStaffMembershipSummarySchema,
    isRootOwner: z.boolean(),
  })
  .strict();
const organizationListPageSchema = z
  .object({
    items: z.array(organizationMembershipContextSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .strict();

export const organizationCoachingAccessOutputSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("granted"), organization: organizationIdentitySchema }).strict(),
  z.object({ status: z.literal("forbidden") }).strict(),
]);
export const organizationContextOutputSchema = z.discriminatedUnion("status", [
  organizationMembershipContextSchema.extend({ status: z.literal("granted") }).strict(),
  z.object({ status: z.literal("forbidden") }).strict(),
]);

type OrganizationsRouterDependencies = {
  getAccessRepository(ctx: Context): OrganizationAccessRepository;
};

const defaultDependencies: OrganizationsRouterDependencies = {
  getAccessRepository: (ctx) => createOrganizationAccessRepository(getRequiredDb(ctx)),
};

function internalError(message: string, cause: unknown): TRPCError {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause });
}

export function createOrganizationsRouter(
  dependencies: OrganizationsRouterDependencies = defaultDependencies,
) {
  return createTRPCRouter({
    listMine: protectedProcedure
      .input(organizationListInputSchema)
      .output(organizationListPageSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await listMyOrganizationContexts({
            repository: dependencies.getAccessRepository(ctx),
            profileId: ctx.session.user.id,
            limit: input.limit,
            cursor: input.cursor,
          });
        } catch (error) {
          throw internalError("Failed to list organizations", error);
        }
      }),
    getContext: protectedProcedure
      .input(organizationIdInputSchema)
      .output(organizationContextOutputSchema)
      .query(async ({ ctx, input }) => {
        try {
          const context = await readOrganizationContext({
            repository: dependencies.getAccessRepository(ctx),
            organizationId: input.organizationId,
            profileId: ctx.session.user.id,
          });
          return context ? { status: "granted", ...context } : { status: "forbidden" };
        } catch (error) {
          throw internalError("Failed to read organization context", error);
        }
      }),
    coachingAccess: protectedProcedure
      .input(organizationIdInputSchema)
      .output(organizationCoachingAccessOutputSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await readOrganizationCoachingAccess({
            repository: dependencies.getAccessRepository(ctx),
            organizationId: input.organizationId,
            profileId: ctx.session.user.id,
          });
        } catch (error) {
          throw internalError("Failed to check organization coaching access", error);
        }
      }),
  });
}

export const organizationsRouter = createOrganizationsRouter();
