import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  endCoachingEngagement,
  endOrganizationMembership,
  listAdministrativeAthleteRoster,
  listOrganizationStaff,
  OrganizationLifecycleError,
  previewStaffOffboardingImpact,
  readAdministrativeOperationalOverview,
  withdrawAthleteConsent,
} from "../application/organizations/manage-organization-lifecycle";
import {
  OrganizationStaffSuspensionError,
  resumeOrganizationMembership,
  suspendOrganizationMembership,
} from "../application/organizations/manage-staff-suspension";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const pageInput = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().nullable().default(null),
  })
  .strict();
const organizationPageInput = z
  .object({
    organizationId: z.string().uuid(),
    status: z.enum(["active", "suspended"]).default("active"),
  })
  .merge(pageInput)
  .strict();
const administrativeRosterInput = z
  .object({
    organizationId: z.string().uuid(),
    engagementStatus: z.enum(["active", "paused"]).nullable().default(null),
    withoutPrimaryAssignment: z.boolean().default(false),
  })
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
const staffSuspensionInput = z
  .object({
    organizationId: z.string().uuid(),
    membershipId: z.string().uuid(),
    operationId: z.string().uuid(),
    reason: z.string().regex(/^[a-z0-9][a-z0-9_]{0,63}$/),
  })
  .strict();
const staffSuspensionOutput = z
  .object({
    membershipId: z.string().uuid(),
    operationId: z.string().uuid(),
    status: z.enum(["suspended", "resumed"]),
  })
  .strict();
const staffOffboardingImpact = z
  .object({
    target: z
      .object({
        membershipId: z.string().uuid(),
        identity,
        offboarding: z
          .object({
            eligible: z.boolean(),
            reason: z.enum(["self", "root_owner", "admin_target"]).nullable(),
          })
          .strict(),
      })
      .strict(),
    assignedAthleteCount: z.number().int().nonnegative(),
    assignedAthletes: z.array(
      z
        .object({
          engagementId: z.string().uuid(),
          profileId: z.string().uuid(),
          displayName: z.string().nullable(),
          username: z.string().nullable(),
          assignmentKinds: z.array(z.enum(["primary", "supporting"])),
        })
        .strict(),
    ),
    nextCursor: z.string().uuid().nullable(),
    hasMore: z.boolean(),
    resourceInventory: z.object({ status: z.literal("unavailable") }).strict(),
  })
  .strict();
const operationalOverviewOutput = z
  .object({
    activeStaff: z.number().int().nonnegative(),
    activeEngagements: z.number().int().nonnegative(),
    pausedEngagements: z.number().int().nonnegative(),
    activeEngagementsWithoutPrimary: z.number().int().nonnegative(),
  })
  .strict();

function fail(error: unknown): never {
  if (error instanceof OrganizationStaffSuspensionError)
    throw new TRPCError({
      code:
        error.reason === "not_found"
          ? "NOT_FOUND"
          : error.reason === "conflict"
            ? "CONFLICT"
            : "FORBIDDEN",
      message: "Organization staff suspension request could not be completed",
      cause: error,
    });
  if (error instanceof OrganizationLifecycleError)
    throw new TRPCError({
      code:
        error.reason === "not_found"
          ? "NOT_FOUND"
          : error.reason === "invalid_cursor"
            ? "BAD_REQUEST"
            : error.reason === "conflict"
              ? "CONFLICT"
              : error.reason === "unavailable"
                ? "PRECONDITION_FAILED"
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
  operationalOverview: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }).strict())
    .output(operationalOverviewOutput)
    .query(({ ctx, input }) =>
      run(
        readAdministrativeOperationalOverview({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          organizationId: input.organizationId,
        }),
      ),
    ),
  staff: createTRPCRouter({
    offboardingImpact: protectedProcedure
      .input(
        z
          .object({ organizationId: z.string().uuid(), membershipId: z.string().uuid() })
          .merge(pageInput)
          .strict(),
      )
      .output(staffOffboardingImpact)
      .query(({ ctx, input }) =>
        run(
          previewStaffOffboardingImpact({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        ),
      ),
    list: protectedProcedure
      .input(organizationPageInput)
      .output(
        pageOutput(
          z
            .object({
              membershipId: z.string().uuid(),
              identity,
              roleKeys: z.array(z.enum(["admin", "coach"])),
              status: z.enum(["active", "suspended"]),
              suspendedAt: z.date().nullable(),
              endMembership: z
                .object({
                  eligible: z.boolean(),
                  reason: z.enum(["self", "root_owner", "admin_target"]).nullable(),
                })
                .strict(),
              actions: z
                .object({
                  suspend: z.object({ eligible: z.boolean() }).strict(),
                  resume: z.object({ eligible: z.boolean() }).strict(),
                  grantAdmin: z.object({ eligible: z.boolean() }).strict(),
                  revokeAdmin: z.object({ eligible: z.boolean() }).strict(),
                  grantCoach: z.object({ eligible: z.boolean() }).strict(),
                  revokeCoach: z.object({ eligible: z.boolean() }).strict(),
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
            status: input.status,
            suspendedAt: item.suspendedAt,
            endMembership: item.endMembership,
            actions: item.actions,
          })),
        };
      }),
  }),
  adminRoster: createTRPCRouter({
    list: protectedProcedure
      .input(administrativeRosterInput)
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
  suspendMembership: protectedProcedure
    .input(staffSuspensionInput)
    .output(staffSuspensionOutput)
    .mutation(({ ctx, input }) =>
      run(
        suspendOrganizationMembership({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
  resumeMembership: protectedProcedure
    .input(staffSuspensionInput)
    .output(staffSuspensionOutput)
    .mutation(({ ctx, input }) =>
      run(
        resumeOrganizationMembership({
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
