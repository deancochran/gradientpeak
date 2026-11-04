import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  endCoachingEngagement,
  endOrganizationMembership,
  listAdministrativeAthleteRoster,
  listOrganizationStaff,
  OrganizationLifecycleError,
  withdrawAthleteConsent,
} from "../application/organizations/manage-organization-lifecycle";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const pageInput = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().nullable().default(null),
  })
  .strict();
const organizationPageInput = z
  .object({ organizationId: z.string().uuid() })
  .merge(pageInput)
  .strict();
const identity = z
  .object({
    profileId: z.string().uuid(),
    displayName: z.string().nullable(),
    username: z.string().nullable(),
  })
  .strict();
const pageOutput = <T extends z.ZodType>(item: T) =>
  z
    .object({
      items: z.array(item),
      nextCursor: z.string().uuid().nullable(),
      hasMore: z.boolean(),
    })
    .strict();
const commandInput = z
  .object({
    organizationId: z.string().uuid(),
    reason: z.string().regex(/^[a-z0-9][a-z0-9_]{0,63}$/),
    correlationId: z.string().uuid(),
  })
  .strict();

function fail(error: unknown): never {
  if (error instanceof OrganizationLifecycleError)
    throw new TRPCError({
      code:
        error.reason === "not_found"
          ? "NOT_FOUND"
          : error.reason === "invalid_cursor"
            ? "BAD_REQUEST"
            : error.reason === "conflict"
              ? "CONFLICT"
              : "FORBIDDEN",
      message: "Organization lifecycle request could not be completed",
      cause: error,
    });
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Organization lifecycle request failed",
    cause: error,
  });
}
const run = <T>(promise: Promise<T>) => promise.catch(fail);

export const organizationLifecycleRouter = createTRPCRouter({
  staff: createTRPCRouter({
    list: protectedProcedure
      .input(organizationPageInput)
      .output(
        pageOutput(
          z
            .object({
              membershipId: z.string().uuid(),
              identity,
              roleKeys: z.array(z.enum(["admin", "coach"])),
              status: z.literal("active"),
              endMembership: z
                .object({
                  eligible: z.boolean(),
                  reason: z.enum(["self", "root_owner", "admin_target"]).nullable(),
                })
                .strict(),
            })
            .strict(),
        ),
      )
      .query(async ({ ctx, input }) => {
        const result = await run(
          listOrganizationStaff({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        );
        return {
          ...result,
          items: result.items.map((item) => ({
            membershipId: item.membershipId,
            identity: {
              profileId: item.profileId,
              displayName: item.displayName,
              username: item.username,
            },
            roleKeys: item.roleKeys as ("admin" | "coach")[],
            status: "active" as const,
            endMembership: item.endMembership,
          })),
        };
      }),
  }),
  adminRoster: createTRPCRouter({
    list: protectedProcedure
      .input(organizationPageInput)
      .output(
        pageOutput(
          z
            .object({
              engagementId: z.string().uuid(),
              identity,
              status: z.enum(["active", "paused"]),
            })
            .strict(),
        ),
      )
      .query(async ({ ctx, input }) => {
        const result = await run(
          listAdministrativeAthleteRoster({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        );
        return {
          ...result,
          items: result.items.map((item) => ({
            engagementId: item.engagementId,
            identity: {
              profileId: item.profileId,
              displayName: item.displayName,
              username: item.username,
            },
            status: item.pausedAt === null ? ("active" as const) : ("paused" as const),
          })),
        };
      }),
  }),
  endMembership: protectedProcedure
    .input(commandInput.extend({ membershipId: z.string().uuid() }))
    .output(z.object({ membershipId: z.string().uuid(), status: z.literal("ended") }).strict())
    .mutation(({ ctx, input }) =>
      run(
        endOrganizationMembership({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
  endEngagement: protectedProcedure
    .input(commandInput.extend({ engagementId: z.string().uuid() }))
    .output(z.object({ engagementId: z.string().uuid(), status: z.literal("ended") }).strict())
    .mutation(({ ctx, input }) =>
      run(
        endCoachingEngagement({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
  withdrawConsent: protectedProcedure
    .input(commandInput.extend({ consentId: z.string().uuid() }))
    .output(z.object({ consentId: z.string().uuid(), status: z.literal("withdrawn") }).strict())
    .mutation(({ ctx, input }) =>
      run(
        withdrawAthleteConsent({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
});
