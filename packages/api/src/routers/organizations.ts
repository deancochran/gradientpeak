import { ianaTimezoneSchema } from "@repo/core";
import {
  evaluateOrganizationOperationRoleEligibility,
  ORGANIZATION_OPERATIONS,
  organizationContextSchema,
  organizationInvitationSummarySchema,
  organizationOperationRoleEligibilityDecisionSchema,
  organizationStaffMembershipSummarySchema,
} from "@repo/core/organizations";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  acceptOrganizationInvitation,
  createOrganization,
  createOrganizationInvitation,
  declineOrganizationInvitation,
  decodeInvitationListCursor,
  listMyOrganizationInvitations,
  listOrganizationInvitations,
  OrganizationManagementError,
  previewOrganizationInvitation,
  resolveAcceptedInvitationRelationship,
  revokeOrganizationInvitation,
} from "../application/organizations/manage-organizations";
import {
  manageStaffRole,
  OrganizationStaffRoleError,
} from "../application/organizations/manage-staff-roles";
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
import { organizationAuditHistoryRouter } from "./organization-audit-history";
import { organizationCoachAthletesRouter } from "./organization-coach-athletes";
import { organizationCoachingAssignmentsRouter } from "./organization-coaching-assignments";
import { organizationCoachingQualityRouter } from "./organization-coaching-quality";
import { organizationGroupsRouter } from "./organization-groups";
import { organizationLifecycleRouter } from "./organization-lifecycle";

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
          ctx.addIssue({
            code: "custom",
            message: "Unsupported organization cursor",
          });
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
const organizationCreateInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(120),
    timezone: ianaTimezoneSchema,
  })
  .strict();
const invitationCreateInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    kind: z.enum(["staff", "athlete"]),
    requestedRole: z.enum(["admin", "coach"]).nullable(),
    recipientProfileId: z.string().uuid().nullable(),
    recipientEmail: z.string().trim().email().max(320).nullable(),
    expiresAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.recipientProfileId === null) === (value.recipientEmail === null))
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one invitation recipient",
      });
    if ((value.kind === "staff") !== (value.requestedRole !== null))
      ctx.addIssue({
        code: "custom",
        message: "Staff invitations require a role and athlete invitations do not",
      });
  });
const invitationAcceptInputSchema = z
  .object({
    token: z.string().min(43).max(256),
    acknowledgement: z
      .object({
        version: z.string().min(1).max(120),
        digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        accepted: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict();
const invitationIdResponseInputSchema = z
  .object({
    invitationId: z.string().uuid(),
    acknowledgement: z
      .object({
        version: z.string().min(1).max(120),
        digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        accepted: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict();
const invitationIdPreviewInputSchema = z.object({ invitationId: z.string().uuid() }).strict();
const invitationPreviewOutputSchema = z
  .object({
    invitationId: z.string().uuid(),
    organizationId: z.string().uuid(),
    organizationName: z.string().min(1).max(120),
    kind: z.enum(["staff", "athlete"]),
    requestedRole: z.enum(["admin", "coach"]).nullable(),
    expiresAt: z.date(),
    agreement: z
      .object({
        version: z.string().min(1),
        digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        terms: z.string().min(1),
        scopes: z.array(
          z.enum(["basic_profile", "training", "activities", "metrics", "goals", "calendar"]),
        ),
      })
      .optional(),
  })
  .strict();
const invitationRevokeInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    invitationId: z.string().uuid(),
  })
  .strict();
const acceptedInvitationRelationshipInputSchema = z
  .object({ organizationId: z.string().uuid(), invitationId: z.string().uuid() })
  .strict();
const staffRoleMutationInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    membershipId: z.string().uuid(),
    role: z.enum(["admin", "coach"]),
    operationId: z.string().uuid(),
  })
  .strict();
const staffRoleMutationOutputSchema = z
  .object({
    membershipId: z.string().uuid(),
    role: z.enum(["admin", "coach"]),
    operationId: z.string().uuid(),
    status: z.enum(["granted", "revoked"]),
  })
  .strict();
const invitationListCursorSchema = z.string().min(1).max(512).nullable().default(null);
const invitationListInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: invitationListCursorSchema,
  })
  .strict()
  .transform((value, ctx) => {
    const cursor = value.cursor === null ? null : decodeInvitationListCursor(value.cursor);
    if (
      value.cursor !== null &&
      (!cursor || cursor.scope !== "organization" || cursor.organizationId !== value.organizationId)
    ) {
      ctx.addIssue({ code: "custom", message: "Unsupported invitation cursor" });
      return z.NEVER;
    }
    return { ...value, cursor };
  });
const myInvitationListInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: invitationListCursorSchema,
  })
  .strict()
  .transform((value, ctx) => {
    const cursor = value.cursor === null ? null : decodeInvitationListCursor(value.cursor);
    if (
      value.cursor !== null &&
      (!cursor || cursor.scope !== "recipient" || cursor.organizationId !== null)
    ) {
      ctx.addIssue({ code: "custom", message: "Unsupported invitation cursor" });
      return z.NEVER;
    }
    return { ...value, cursor };
  });
const organizationCreateOutputSchema = z
  .object({
    organizationId: z.string().uuid(),
    membershipId: z.string().uuid(),
  })
  .strict();
const invitationCreateOutputSchema = z
  .object({
    invitationId: z.string().uuid(),
    expiresAt: z.date(),
    createdAt: z.date(),
    token: z.string().min(1),
  })
  .strict();
const invitationAcceptOutputSchema = z
  .object({
    invitationId: z.string().uuid(),
    organizationId: z.string().uuid(),
    status: z.literal("accepted"),
  })
  .strict();
const invitationDeclineOutputSchema = z
  .object({ invitationId: z.string().uuid(), status: z.literal("declined") })
  .strict();
const invitationRevokeOutputSchema = z
  .object({ invitationId: z.string().uuid(), status: z.literal("revoked") })
  .strict();
const invitationListOutputSchema = z
  .object({
    items: z.array(organizationInvitationSummarySchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .strict();
const acceptedInvitationRelationshipOutputSchema = z
  .object({
    relationshipState: z.enum([
      "staff_active",
      "staff_suspended",
      "staff_ended",
      "staff_not_provisioned",
      "staff_no_effective_role",
      "athlete_active",
      "athlete_paused",
      "athlete_no_current_engagement",
    ]),
    navigationTarget: z.enum(["staff_roster", "none"]),
  })
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
  z
    .object({
      status: z.literal("granted"),
      organization: organizationIdentitySchema,
    })
    .strict(),
  z.object({ status: z.literal("forbidden") }).strict(),
]);
export const organizationContextOutputSchema = z.discriminatedUnion("status", [
  organizationMembershipContextSchema.extend({ status: z.literal("granted") }).strict(),
  z.object({ status: z.literal("forbidden") }).strict(),
]);
const organizationCapabilitySummarySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("granted"),
      membershipId: z.string().uuid(),
      isRootOwner: z.boolean(),
      operations: z.array(organizationOperationRoleEligibilityDecisionSchema),
    })
    .strict(),
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
function managementError(error: unknown): never {
  if (error instanceof OrganizationManagementError) {
    const code =
      error.reason === "not_found"
        ? "NOT_FOUND"
        : error.reason === "conflict"
          ? "CONFLICT"
          : error.reason === "already_closed" || error.reason === "membership_ended"
            ? "PRECONDITION_FAILED"
            : "FORBIDDEN";
    throw new TRPCError({
      code,
      message: "Organization request could not be completed",
      cause: error,
    });
  }
  throw internalError("Organization request failed", error);
}
function staffRoleError(error: unknown): never {
  if (error instanceof OrganizationStaffRoleError) {
    throw new TRPCError({
      code:
        error.reason === "conflict"
          ? "CONFLICT"
          : error.reason === "not_found"
            ? "NOT_FOUND"
            : "FORBIDDEN",
      message: "Organization staff role request could not be completed",
      cause: error,
    });
  }
  throw internalError("Organization staff role request failed", error);
}

export function createOrganizationsRouter(
  dependencies: OrganizationsRouterDependencies = defaultDependencies,
) {
  return createTRPCRouter({
    create: protectedProcedure
      .input(organizationCreateInputSchema)
      .output(organizationCreateOutputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await createOrganization({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          });
        } catch (error) {
          return managementError(error);
        }
      }),
    invitations: createTRPCRouter({
      create: protectedProcedure
        .input(invitationCreateInputSchema)
        .output(invitationCreateOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await createOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              organizationId: input.organizationId,
              kind: input.kind,
              role: input.requestedRole,
              recipientProfileId: input.recipientProfileId,
              recipientEmail: input.recipientEmail?.toLowerCase() ?? null,
              expiresAt: input.expiresAt,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      accept: protectedProcedure
        .input(invitationAcceptInputSchema)
        .output(invitationAcceptOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await acceptOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              token: input.token,
              ...(input.acknowledgement ? { acknowledgement: input.acknowledgement } : {}),
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      acceptById: protectedProcedure
        .input(invitationIdResponseInputSchema)
        .output(invitationAcceptOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await acceptOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              invitationId: input.invitationId,
              ...(input.acknowledgement ? { acknowledgement: input.acknowledgement } : {}),
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      preview: protectedProcedure
        .input(invitationAcceptInputSchema)
        .output(invitationPreviewOutputSchema)
        .query(async ({ ctx, input }) => {
          try {
            return await previewOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              token: input.token,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      previewById: protectedProcedure
        .input(invitationIdPreviewInputSchema)
        .output(invitationPreviewOutputSchema)
        .query(async ({ ctx, input }) => {
          try {
            return await previewOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              invitationId: input.invitationId,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      decline: protectedProcedure
        .input(invitationAcceptInputSchema)
        .output(invitationDeclineOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await declineOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              token: input.token,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      declineById: protectedProcedure
        .input(invitationIdPreviewInputSchema)
        .output(invitationDeclineOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await declineOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              invitationId: input.invitationId,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      revoke: protectedProcedure
        .input(invitationRevokeInputSchema)
        .output(invitationRevokeOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await revokeOrganizationInvitation({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              ...input,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      listForOrganization: protectedProcedure
        .input(invitationListInputSchema)
        .output(invitationListOutputSchema)
        .query(async ({ ctx, input }) => {
          try {
            return await listOrganizationInvitations({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              ...input,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      resolveAcceptedRelationship: protectedProcedure
        .input(acceptedInvitationRelationshipInputSchema)
        .output(acceptedInvitationRelationshipOutputSchema)
        .query(async ({ ctx, input }) => {
          try {
            return await resolveAcceptedInvitationRelationship({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              ...input,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
      listMine: protectedProcedure
        .input(myInvitationListInputSchema)
        .output(invitationListOutputSchema)
        .query(async ({ ctx, input }) => {
          try {
            return await listMyOrganizationInvitations({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              ...input,
            });
          } catch (error) {
            return managementError(error);
          }
        }),
    }),
    staffRoles: createTRPCRouter({
      grant: protectedProcedure
        .input(staffRoleMutationInputSchema)
        .output(staffRoleMutationOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await manageStaffRole({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              targetMembershipId: input.membershipId,
              role: input.role,
              mutation: "grant",
              operationId: input.operationId,
              organizationId: input.organizationId,
            });
          } catch (error) {
            return staffRoleError(error);
          }
        }),
      revoke: protectedProcedure
        .input(staffRoleMutationInputSchema)
        .output(staffRoleMutationOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await manageStaffRole({
              db: getRequiredDb(ctx),
              actorProfileId: ctx.session.user.id,
              targetMembershipId: input.membershipId,
              role: input.role,
              mutation: "revoke",
              operationId: input.operationId,
              organizationId: input.organizationId,
            });
          } catch (error) {
            return staffRoleError(error);
          }
        }),
    }),
    organizationGroups: organizationGroupsRouter,
    auditHistory: organizationAuditHistoryRouter,
    coachingAssignments: organizationCoachingAssignmentsRouter,
    coachingQuality: organizationCoachingQualityRouter,
    coachAthletes: organizationCoachAthletesRouter,
    lifecycle: organizationLifecycleRouter,
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
    /** Advisory shell capabilities only; private reads still use their complete access predicate. */
    managementCapabilities: protectedProcedure
      .input(organizationIdInputSchema)
      .output(organizationCapabilitySummarySchema)
      .query(async ({ ctx, input }) => {
        try {
          const context = await readOrganizationContext({
            repository: dependencies.getAccessRepository(ctx),
            organizationId: input.organizationId,
            profileId: ctx.session.user.id,
          });
          if (!context) return { status: "forbidden" };
          return {
            status: "granted",
            membershipId: context.membership.membershipId,
            isRootOwner: context.isRootOwner,
            operations: ORGANIZATION_OPERATIONS.map((operation) =>
              evaluateOrganizationOperationRoleEligibility({
                operation,
                isRootOwner: context.isRootOwner,
                isMember: true,
                roles: context.membership.roles,
              }),
            ),
          };
        } catch (error) {
          throw internalError("Failed to read organization capabilities", error);
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
