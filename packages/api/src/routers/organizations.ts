import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { readOrganizationCoachingAccess } from "../application/organizations/read-coaching-access";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import {
  createOrganizationAccessRepository,
  type OrganizationAccessRepository,
} from "../repositories/organization-access-repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const organizationCoachingAccessInputSchema = z
  .object({ organizationId: z.string().uuid() })
  .strict();

const organizationIdentitySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  })
  .strict();

export const organizationCoachingAccessOutputSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("granted"), organization: organizationIdentitySchema }).strict(),
  z.object({ status: z.literal("forbidden") }).strict(),
]);

type OrganizationsRouterDependencies = {
  getAccessRepository(ctx: Context): OrganizationAccessRepository;
};

const defaultDependencies: OrganizationsRouterDependencies = {
  getAccessRepository: (ctx) => createOrganizationAccessRepository(getRequiredDb(ctx)),
};

export function createOrganizationsRouter(
  dependencies: OrganizationsRouterDependencies = defaultDependencies,
) {
  return createTRPCRouter({
    coachingAccess: protectedProcedure
      .input(organizationCoachingAccessInputSchema)
      .output(organizationCoachingAccessOutputSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await readOrganizationCoachingAccess({
            repository: dependencies.getAccessRepository(ctx),
            organizationId: input.organizationId,
            profileId: ctx.session.user.id,
          });
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to check organization coaching access",
          });
        }
      }),
  });
}

export const organizationsRouter = createOrganizationsRouter();
