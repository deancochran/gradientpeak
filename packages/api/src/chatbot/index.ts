import {
  type ChatbotToolDefinition,
  ChatbotToolError,
  chatbotToolDescriptorSchema,
  createChatbotToolRegistry,
  defineChatbotTool,
} from "@repo/core/chatbot";
import { z } from "zod";
import {
  trainingPlanApplicationApplyInputSchema,
  trainingPlanApplicationApplyResultSchema,
  trainingPlanApplicationPreviewInputSchema,
  trainingPlanApplicationPreviewResultSchema,
} from "../application/training-plan/applyTemplateUseCase";
import {
  trainingPlanCommitInputSchema,
  trainingPlanCommitResultSchema,
  trainingPlanPreviewInputSchema,
  trainingPlanPreviewResultSchema,
} from "../application/training-plan/projection-planning";
import { apiCapabilityCatalog, apiRouterInventory } from "../capabilities/generated";
import type { ApiContext } from "../context";
import {
  cancelPlannedSessionDtoRequestSchema,
  createPlannedSessionDtoRequestSchema,
  movePlannedSessionDtoRequestSchema,
} from "../contracts/planned-sessions";
import { appRouter } from "../routers";
import { createManualDiaryEntryInputSchema, updateInputSchema } from "../routers/activities";
import { createActivityPlanInput, updateActivityPlanWithIdInput } from "../routers/activity-plans";
import { createMessageInputSchema } from "../routers/messaging";

const noInputSchema = z.object({}).strict();
const unreadNotificationCountSchema = z.number().int().nonnegative();
const listCursorInputSchema = z.string().min(1).max(512).optional();
const forwardDirectionInputSchema = z.literal("forward").optional();
const operationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const operationIdUuidSchema = z.string().uuid();

const apiChatbotToolDescriptorSchema = chatbotToolDescriptorSchema.extend({
  /** The operation ID is host-owned when this descriptor is exposed to a model. */
  operationIdPath: z.array(z.string().min(1)).min(1).optional(),
  routerOperation: z.string().regex(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/),
});
export type ApiChatbotToolDescriptor = z.infer<typeof apiChatbotToolDescriptorSchema>;

/** Only the inferred caller method named by this module's explicit allowlist is exposed here. */
type AppRouterCaller = Partial<{
  activityPlans: Partial<
    Pick<
      ReturnType<typeof appRouter.createCaller>["activityPlans"],
      "create" | "getById" | "list" | "update"
    >
  >;
  activities: Partial<
    Pick<
      ReturnType<typeof appRouter.createCaller>["activities"],
      "createManualDiaryEntry" | "listPaginated" | "update"
    >
  >;
  goals: Pick<ReturnType<typeof appRouter.createCaller>["goals"], "getById" | "list">;
  notifications: Pick<ReturnType<typeof appRouter.createCaller>["notifications"], "getUnreadCount">;
  messaging: Partial<Pick<ReturnType<typeof appRouter.createCaller>["messaging"], "sendMessage">>;
  plannedSessions: Partial<
    Pick<
      ReturnType<typeof appRouter.createCaller>["plannedSessions"],
      "cancel" | "create" | "move" | "range"
    >
  >;
  profiles: Pick<ReturnType<typeof appRouter.createCaller>["profiles"], "getPublicById">;
  trainingPlans: Partial<
    Pick<
      ReturnType<typeof appRouter.createCaller>["trainingPlans"],
      "applyApplication" | "commit" | "get" | "list" | "preview" | "previewApplication"
    >
  >;
}>;
type TrustedApiToolContext = { actorProfileId: string | null; caller: AppRouterCaller };

function requireCallerBinding<T>(value: T | undefined, name: string): T {
  if (!value) throw new Error(`Chatbot caller is missing ${name}`);
  return value;
}

function requireTrustedActor(actorProfileId: string | null): string {
  if (!actorProfileId)
    throw new ChatbotToolError("unauthorized", "Sign in to use this chatbot tool.");
  return actorProfileId;
}
type AnyZodSchema = z.ZodType<unknown, unknown>;

function requireReadRouterOperation(routerOperation: string) {
  const inventory = apiRouterInventory.find((item) => item.id === routerOperation);
  const capability = apiCapabilityCatalog.find((item) => item.id === routerOperation);
  if (
    inventory?.procedureType !== "query" ||
    capability?.procedureType !== "query" ||
    capability.mutationSafety !== undefined ||
    capability.access !== "authenticated_session" ||
    capability.authorizationAssurance !== "authentication_boundary"
  ) {
    throw new Error(
      `Chatbot API tool must bind an authenticated read operation: ${routerOperation}`,
    );
  }
  return { routerOperation };
}

function requireWriteRouterOperation(routerOperation: string) {
  const inventory = apiRouterInventory.find((item) => item.id === routerOperation);
  const capability = apiCapabilityCatalog.find((item) => item.id === routerOperation);
  if (
    inventory?.procedureType !== "mutation" ||
    capability?.procedureType !== "mutation" ||
    capability.access !== "authenticated_session"
  ) {
    throw new Error(
      `Chatbot API tool must bind an authenticated write operation: ${routerOperation}`,
    );
  }
  return { routerOperation };
}

type ApiReadToolOptions<TInputSchema extends AnyZodSchema, TOutputSchema extends AnyZodSchema> = {
  description: string;
  execute: (
    context: TrustedApiToolContext,
    input: z.output<TInputSchema>,
  ) => z.input<TOutputSchema> | Promise<z.input<TOutputSchema>>;
  id: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  routerOperation: string;
};

type ApiReadTool<TInputSchema extends AnyZodSchema, TOutputSchema extends AnyZodSchema> = Omit<
  ChatbotToolDefinition<TInputSchema, TOutputSchema, TrustedApiToolContext>,
  "descriptor"
> & { readonly descriptor: ApiChatbotToolDescriptor };

/**
 * Author an allowlisted API read tool with a Zod input/output contract and a normal tRPC caller.
 * The handler gets parsed input and the request's trusted caller; untrusted calls never select a router.
 */
export function defineApiReadTool<
  TInputSchema extends AnyZodSchema,
  TOutputSchema extends AnyZodSchema,
>(
  options: ApiReadToolOptions<TInputSchema, TOutputSchema>,
): ApiReadTool<TInputSchema, TOutputSchema> {
  const binding = requireReadRouterOperation(options.routerOperation);
  const tool = defineChatbotTool({
    ...options,
    operation: "read" as const,
    retrySafety: "retry_safe" as const,
    scope: "api" as const,
  });
  return {
    ...tool,
    descriptor: apiChatbotToolDescriptorSchema.parse({ ...tool.descriptor, ...binding }),
  };
}

type ApiWriteToolOptions<
  TInputSchema extends AnyZodSchema,
  TOutputSchema extends AnyZodSchema,
> = ApiReadToolOptions<TInputSchema, TOutputSchema> & {
  /** Path to the existing required operation ID in the validated API input. */
  operationIdPath: readonly string[];
};

/** Author an allowlisted write tool. Every tool schema must require a stable operationId. */
export function defineApiWriteTool<
  TInputSchema extends AnyZodSchema,
  TOutputSchema extends AnyZodSchema,
>(
  options: ApiWriteToolOptions<TInputSchema, TOutputSchema>,
): ApiReadTool<TInputSchema, TOutputSchema> {
  const binding = requireWriteRouterOperation(options.routerOperation);
  const tool = defineChatbotTool({
    ...options,
    operation: "write" as const,
    retrySafety: "retry_safe" as const,
    scope: "api" as const,
  });
  return {
    ...tool,
    descriptor: apiChatbotToolDescriptorSchema.parse({
      ...tool.descriptor,
      ...binding,
      operationIdPath: options.operationIdPath,
    }),
  };
}

/** The API allowlist is deliberately separate from Core; writes require durable operation IDs. */
const apiChatbotTools = [
  defineApiReadTool({
    description: "Read the signed-in athlete's unread notification count.",
    // retry_safe means this performs no domain mutation; the normal tRPC rate limiter still applies.
    execute: ({ caller }, _input) =>
      requireCallerBinding(
        requireCallerBinding(caller.notifications, "notifications").getUnreadCount,
        "notifications.getUnreadCount",
      )(),
    id: "api.notifications.get-unread-count",
    inputSchema: noInputSchema,
    outputSchema: unreadNotificationCountSchema,
    routerOperation: "notifications.getUnreadCount",
  }),
  defineApiReadTool({
    description:
      "List the signed-in athlete's activity plans with bounded pagination and no authoring notes.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.activityPlans, "activityPlans").list,
        "activityPlans.list",
      )({
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.direction === undefined ? {} : { direction: input.direction }),
        limit: input.limit,
        ownerScope: "own",
      });
      return {
        items: result.items.map((plan) => ({
          id: plan.id,
          name: plan.name,
          category: plan.activityCategory,
        })),
        nextCursor: result.nextCursor ?? null,
      };
    },
    id: "api.activity-plans.list-own",
    inputSchema: z
      .object({
        limit: z.number().int().min(1).max(20).default(10),
        cursor: listCursorInputSchema,
        direction: forwardDirectionInputSchema,
      })
      .strict(),
    outputSchema: z
      .object({
        items: z
          .array(
            z.object({ id: z.string().uuid(), name: z.string(), category: z.string() }).strict(),
          )
          .max(20),
        nextCursor: z.string().nullable(),
      })
      .strict(),
    routerOperation: "activityPlans.list",
  }),
  defineApiReadTool({
    description:
      "Read a permitted activity plan's concise identity and category; normal router access policy decides whether it is visible.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.activityPlans, "activityPlans").getById,
        "activityPlans.getById",
      )({
        id: input.id,
        personalize: false,
      });
      return {
        id: result.detail.id,
        name: result.detail.name,
        category: result.detail.activityCategory,
        revision: result.edit?.activityPlanRevision ?? null,
        structureHash: result.edit?.structureHash ?? null,
      };
    },
    id: "api.activity-plans.get-summary",
    inputSchema: z.object({ id: z.string().uuid() }).strict(),
    outputSchema: z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        category: z.string(),
        revision: z.number().int().positive().nullable(),
        structureHash: z
          .string()
          .regex(/^v1:sha256:[0-9a-f]{64}$/)
          .nullable(),
      })
      .strict(),
    routerOperation: "activityPlans.getById",
  }),
  defineApiReadTool({
    description:
      "List the signed-in athlete's training plans with bounded pagination and concise metadata.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.trainingPlans, "trainingPlans").list,
        "trainingPlans.list",
      )({
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.direction === undefined ? {} : { direction: input.direction }),
        limit: input.limit,
        ownerScope: "own",
      });
      return {
        items: result.items.map((plan) => ({
          id: plan.id,
          name: plan.name,
          description: plan.description ?? null,
        })),
        nextCursor: result.nextCursor ?? null,
      };
    },
    id: "api.training-plans.list-own",
    inputSchema: z
      .object({
        limit: z.number().int().min(1).max(20).default(10),
        cursor: listCursorInputSchema,
        direction: forwardDirectionInputSchema,
      })
      .strict(),
    outputSchema: z
      .object({
        items: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                name: z.string(),
                description: z.string().nullable(),
              })
              .strict(),
          )
          .max(20),
        nextCursor: z.string().nullable(),
      })
      .strict(),
    routerOperation: "trainingPlans.list",
  }),
  defineApiReadTool({
    description:
      "Read a permitted training plan's concise identity and description; normal router access policy decides whether it is visible.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.trainingPlans, "trainingPlans").get,
        "trainingPlans.get",
      )({
        id: input.id,
      });
      return {
        id: result.id,
        name: result.name,
        description: result.description ?? null,
        revision: result.revision,
        structureHash: result.structure_hash,
      };
    },
    id: "api.training-plans.get-summary",
    inputSchema: z.object({ id: z.string().uuid() }).strict(),
    outputSchema: z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        description: z.string().nullable(),
        revision: z.number().int().positive(),
        structureHash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
      })
      .strict(),
    routerOperation: "trainingPlans.get",
  }),
  defineApiReadTool({
    description:
      "List recent activities belonging to the signed-in athlete, with bounded pagination and concise display fields.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.activities, "activities").listPaginated,
        "activities.listPaginated",
      )({
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.direction === undefined ? {} : { direction: input.direction }),
        limit: input.limit,
        composition_mode: "include_multisport",
        sort_by: "date",
        sort_order: "desc",
      });
      return {
        items: result.items.map((activity) => ({
          id: activity.id,
          name: activity.title,
          startedAt: activity.time.startedAt,
        })),
        nextCursor: result.nextCursor ?? null,
      };
    },
    id: "api.activities.list-recent-own",
    inputSchema: z
      .object({
        limit: z.number().int().min(1).max(20).default(10),
        cursor: listCursorInputSchema,
        direction: forwardDirectionInputSchema,
      })
      .strict(),
    outputSchema: z
      .object({
        items: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                name: z.string(),
                startedAt: z.string().datetime({ offset: true }).nullable(),
              })
              .strict(),
          )
          .max(20),
        nextCursor: z.string().nullable(),
      })
      .strict(),
    routerOperation: "activities.listPaginated",
  }),
  defineApiReadTool({
    description:
      "List the signed-in athlete's goals with bounded pagination; profile identity always comes from trusted request context.",
    execute: async ({ actorProfileId, caller }, input) => {
      const result = await requireCallerBinding(caller.goals, "goals").list({
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.direction === undefined ? {} : { direction: input.direction }),
        profile_id: requireTrustedActor(actorProfileId),
        limit: input.limit,
        sort_by: "target_date",
        sort_order: "asc",
      });
      return {
        items: result.items.map((goal) => ({
          id: goal.id,
          title: goal.title,
          targetDate: goal.target_date,
          priority: goal.priority,
        })),
        nextCursor: result.nextCursor ?? null,
      };
    },
    id: "api.goals.list-own",
    inputSchema: z
      .object({
        limit: z.number().int().min(1).max(20).default(10),
        cursor: listCursorInputSchema,
        direction: forwardDirectionInputSchema,
      })
      .strict(),
    outputSchema: z
      .object({
        items: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                title: z.string(),
                targetDate: z.string().date(),
                priority: z.number().int().min(0).max(10),
              })
              .strict(),
          )
          .max(20),
        nextCursor: z.string().nullable(),
      })
      .strict(),
    routerOperation: "goals.list",
  }),
  defineApiReadTool({
    description:
      "Read scheduled sessions in an inclusive 1-90 day calendar-date range for the signed-in athlete only.",
    execute: async ({ actorProfileId, caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.plannedSessions, "plannedSessions").range,
        "plannedSessions.range",
      )({
        profileId: requireTrustedActor(actorProfileId),
        range: input,
      });
      return {
        items: result.items.slice(0, 500).map((session) => ({
          id: session.id,
          planningDate: session.planningDate,
          activityPlanId: session.activityPlanId,
          status: session.lifecycle.status,
        })),
        truncated: result.truncated || result.items.length > 500,
      };
    },
    id: "api.planned-sessions.range-own",
    inputSchema: z
      .object({ startDate: z.string().date(), endDate: z.string().date() })
      .strict()
      .superRefine((input, context) => {
        const days =
          (Date.parse(`${input.endDate}T00:00:00.000Z`) -
            Date.parse(`${input.startDate}T00:00:00.000Z`)) /
            86_400_000 +
          1;
        if (days < 1 || days > 90)
          context.addIssue({
            code: "custom",
            path: ["endDate"],
            message: "Range must cover 1-90 inclusive days.",
          });
      }),
    outputSchema: z
      .object({
        items: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                planningDate: z.string().date(),
                activityPlanId: z.string().uuid(),
                status: z.string(),
              })
              .strict(),
          )
          .max(500),
        truncated: z.boolean(),
      })
      .strict(),
    routerOperation: "plannedSessions.range",
  }),
  defineApiReadTool({
    description:
      "Read the signed-in athlete's basic profile identity and preferences without email, date of birth, biography, or media fields.",
    execute: async ({ actorProfileId, caller }, _input) => {
      const profile = await requireCallerBinding(caller.profiles, "profiles").getPublicById({
        id: requireTrustedActor(actorProfileId),
      });
      return {
        id: profile.id,
        fullName: profile.full_name,
        username: profile.username,
        preferredUnits: profile.preferred_units,
        language: profile.language,
      };
    },
    id: "api.profiles.get-own-basic",
    inputSchema: noInputSchema,
    outputSchema: z
      .object({
        id: z.string().uuid(),
        fullName: z.string().nullable(),
        username: z.string().nullable(),
        preferredUnits: z.string().nullable(),
        language: z.string().nullable(),
      })
      .strict(),
    routerOperation: "profiles.getPublicById",
  }),
  defineApiWriteTool({
    description: "Create an activity plan for the signed-in athlete using a stable operation ID.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.activityPlans, "activityPlans").create,
        "activityPlans.create",
      )(input);
      return { id: result.id, revision: result.revision, structure_hash: result.structure_hash };
    },
    id: "api.activity-plans.create",
    inputSchema: createActivityPlanInput.extend({ operationId: operationIdSchema }).strict(),
    operationIdPath: ["operationId"],
    outputSchema: z
      .object({
        id: z.string().uuid(),
        revision: z.number().int().positive(),
        structure_hash: z.string(),
      })
      .strict(),
    routerOperation: "activityPlans.create",
  }),
  defineApiWriteTool({
    description:
      "Edit an owned activity plan with its current revision and structure hash and a stable operation ID.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.activityPlans, "activityPlans").update,
        "activityPlans.update",
      )(input);
      return { id: result.id, revision: result.revision, structure_hash: result.structure_hash };
    },
    id: "api.activity-plans.update",
    inputSchema: updateActivityPlanWithIdInput.safeExtend({ operationId: operationIdSchema }),
    operationIdPath: ["operationId"],
    outputSchema: z
      .object({
        id: z.string().uuid(),
        revision: z.number().int().positive(),
        structure_hash: z.string(),
      })
      .strict(),
    routerOperation: "activityPlans.update",
  }),
  defineApiWriteTool({
    description:
      "Schedule an owned activity plan on a calendar date using one stable operation ID.",
    execute: async ({ actorProfileId, caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.plannedSessions, "plannedSessions").create,
        "plannedSessions.create",
      )({
        profileId: requireTrustedActor(actorProfileId),
        operationId: input.operationId,
        session: { ...input.session, source: { kind: "direct", operationId: input.operationId } },
      });
      return {
        outcome: result.outcome,
        session: {
          id: result.session.id,
          sessionRevision: result.session.sessionRevision,
          planningDate: result.session.planningDate,
        },
      };
    },
    id: "api.planned-sessions.create",
    inputSchema: z
      .object({
        operationId: operationIdUuidSchema,
        session: createPlannedSessionDtoRequestSchema.shape.session.omit({ source: true }),
      })
      .strict(),
    operationIdPath: ["operationId"],
    outputSchema: z
      .object({
        outcome: z.enum(["created", "unchanged", "updated"]),
        session: z
          .object({
            id: z.string().uuid(),
            sessionRevision: z.number().int().positive(),
            planningDate: z.string().date(),
          })
          .strict(),
      })
      .strict(),
    routerOperation: "plannedSessions.create",
  }),
  defineApiWriteTool({
    description:
      "Move an owned scheduled session using its current revision and a stable operation ID.",
    execute: async ({ actorProfileId, caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.plannedSessions, "plannedSessions").move,
        "plannedSessions.move",
      )({ ...input, profileId: requireTrustedActor(actorProfileId) });
      return {
        outcome: result.outcome,
        session: {
          id: result.session.id,
          sessionRevision: result.session.sessionRevision,
          planningDate: result.session.planningDate,
        },
      };
    },
    id: "api.planned-sessions.move",
    inputSchema: movePlannedSessionDtoRequestSchema
      .omit({ profileId: true })
      .extend({ operationId: operationIdUuidSchema }),
    operationIdPath: ["operationId"],
    outputSchema: z
      .object({
        outcome: z.enum(["created", "unchanged", "updated"]),
        session: z
          .object({
            id: z.string().uuid(),
            sessionRevision: z.number().int().positive(),
            planningDate: z.string().date(),
          })
          .strict(),
      })
      .strict(),
    routerOperation: "plannedSessions.move",
  }),
  defineApiWriteTool({
    description:
      "Cancel an owned scheduled session using its current revision and a stable operation ID.",
    execute: async ({ actorProfileId, caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.plannedSessions, "plannedSessions").cancel,
        "plannedSessions.cancel",
      )({ ...input, profileId: requireTrustedActor(actorProfileId) });
      return {
        outcome: result.outcome,
        session: {
          id: result.session.id,
          sessionRevision: result.session.sessionRevision,
          planningDate: result.session.planningDate,
        },
      };
    },
    id: "api.planned-sessions.cancel",
    inputSchema: cancelPlannedSessionDtoRequestSchema
      .omit({ profileId: true })
      .extend({ operationId: operationIdUuidSchema }),
    operationIdPath: ["operationId"],
    outputSchema: z
      .object({
        outcome: z.enum(["created", "unchanged", "updated"]),
        session: z
          .object({
            id: z.string().uuid(),
            sessionRevision: z.number().int().positive(),
            planningDate: z.string().date(),
          })
          .strict(),
      })
      .strict(),
    routerOperation: "plannedSessions.cancel",
  }),
  defineApiWriteTool({
    description: "Update owned activity metadata with a stable operation ID.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.activities, "activities").update,
        "activities.update",
      )(input);
      return { id: result.id, name: result.name };
    },
    id: "api.activities.update",
    inputSchema: updateInputSchema.extend({ operationId: operationIdSchema }),
    operationIdPath: ["operationId"],
    outputSchema: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
    routerOperation: "activities.update",
  }),
  defineApiWriteTool({
    description: "Create one manual activity diary entry with a stable operation ID.",
    execute: async ({ caller }, input) => {
      const result = await requireCallerBinding(
        requireCallerBinding(caller.activities, "activities").createManualDiaryEntry,
        "activities.createManualDiaryEntry",
      )(input);
      return {
        outcome: result.outcome,
        activity: {
          id: result.activity.id,
          name: result.activity.name,
          diaryDate: result.activity.diaryDate,
        },
      };
    },
    id: "api.activities.create-manual-diary-entry",
    inputSchema: createManualDiaryEntryInputSchema.safeExtend({
      observation: createManualDiaryEntryInputSchema.shape.observation.safeExtend({
        operationId: operationIdUuidSchema,
      }),
    }),
    operationIdPath: ["observation", "operationId"],
    outputSchema: z
      .object({
        outcome: z.enum(["created", "unchanged"]),
        activity: z
          .object({ id: z.string().uuid(), name: z.string(), diaryDate: z.string().date() })
          .strict(),
      })
      .strict(),
    routerOperation: "activities.createManualDiaryEntry",
  }),
  defineApiWriteTool({
    description:
      "Send a message only in an existing conversation where the signed-in athlete is authorized, with a stable operation ID.",
    execute: ({ caller }, { operationId, ...input }) =>
      requireCallerBinding(
        requireCallerBinding(caller.messaging, "messaging").sendMessage,
        "messaging.sendMessage",
      )({
        ...input,
        operation_id: operationId,
      }),
    id: "api.messaging.send-message",
    inputSchema: createMessageInputSchema
      .omit({ operation_id: true })
      .extend({ operationId: operationIdSchema }),
    operationIdPath: ["operationId"],
    outputSchema: z.object({ success: z.literal(true) }).strict(),
    routerOperation: "messaging.sendMessage",
  }),
  defineApiReadTool({
    description:
      "Preview a training-plan create, update, or duplicate and return its real fingerprint for a later commit.",
    execute: ({ caller }, input) =>
      requireCallerBinding(
        requireCallerBinding(caller.trainingPlans, "trainingPlans").preview,
        "trainingPlans.preview",
      )(input),
    id: "api.training-plans.preview",
    inputSchema: trainingPlanPreviewInputSchema,
    outputSchema: trainingPlanPreviewResultSchema,
    routerOperation: "trainingPlans.preview",
  }),
  defineApiWriteTool({
    description:
      "Commit exactly a previously previewed training-plan create, update, or duplicate with a stable operation ID.",
    execute: ({ caller }, input) =>
      requireCallerBinding(
        requireCallerBinding(caller.trainingPlans, "trainingPlans").commit,
        "trainingPlans.commit",
      )(input),
    id: "api.training-plans.commit",
    inputSchema: trainingPlanCommitInputSchema,
    operationIdPath: ["operationId"],
    outputSchema: trainingPlanCommitResultSchema,
    routerOperation: "trainingPlans.commit",
  }),
  defineApiReadTool({
    description:
      "Preview applying a training plan and return its real revision, hash, and fingerprint; it does not apply changes.",
    execute: ({ caller }, input) =>
      requireCallerBinding(
        requireCallerBinding(caller.trainingPlans, "trainingPlans").previewApplication,
        "trainingPlans.previewApplication",
      )(input),
    id: "api.training-plans.preview-application",
    inputSchema: trainingPlanApplicationPreviewInputSchema,
    outputSchema: trainingPlanApplicationPreviewResultSchema,
    routerOperation: "trainingPlans.previewApplication",
  }),
  defineApiWriteTool({
    description:
      "Apply exactly a training-plan application preview with its real revision, hash, fingerprint, and stable operation ID.",
    execute: ({ caller }, input) =>
      requireCallerBinding(
        requireCallerBinding(caller.trainingPlans, "trainingPlans").applyApplication,
        "trainingPlans.applyApplication",
      )(input),
    id: "api.training-plans.apply-application",
    inputSchema: trainingPlanApplicationApplyInputSchema,
    operationIdPath: ["operationId"],
    outputSchema: trainingPlanApplicationApplyResultSchema,
    routerOperation: "trainingPlans.applyApplication",
  }),
] as const;

const apiChatbotToolRegistry = createChatbotToolRegistry(apiChatbotTools);

export function listApiChatbotTools(): readonly ApiChatbotToolDescriptor[] {
  return apiChatbotTools.map((tool) => tool.descriptor);
}

export interface ChatbotApiExecutor {
  execute(call: unknown): Promise<unknown>;
  listTools(): readonly ApiChatbotToolDescriptor[];
}

export interface CreateChatbotApiExecutorOptions {
  createCaller?: (context: ApiContext) => AppRouterCaller;
}

/** Creates a server-only executor: trusted context supplies actor, tool calls supply only validated input. */
export function createChatbotApiExecutor(
  context: ApiContext,
  { createCaller = appRouter.createCaller }: CreateChatbotApiExecutorOptions = {},
): ChatbotApiExecutor {
  const caller = createCaller(context);
  const trustedContext: TrustedApiToolContext = {
    actorProfileId: context.session?.user.id ?? null,
    caller,
  };
  return {
    execute: async (call) => {
      try {
        return await apiChatbotToolRegistry.execute(trustedContext, call);
      } catch (error) {
        throw sanitizeApiExecutionError(error);
      }
    },
    listTools: listApiChatbotTools,
  };
}

function sanitizeApiExecutionError(error: unknown): ChatbotToolError {
  if (error instanceof ChatbotToolError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === "UNAUTHORIZED")
    return new ChatbotToolError("unauthorized", "Sign in to use this chatbot tool.");
  if (code === "TOO_MANY_REQUESTS") {
    return new ChatbotToolError("rate_limited", "This chatbot tool is temporarily rate limited.");
  }
  if (code === "CONFLICT")
    return new ChatbotToolError("conflict", "The requested change conflicts with current state.");
  if (code === "FORBIDDEN")
    return new ChatbotToolError("forbidden", "You are not allowed to perform this chatbot action.");
  if (code === "NOT_FOUND")
    return new ChatbotToolError("not_found", "The requested resource is not available.");
  if (code === "BAD_REQUEST" || code === "PRECONDITION_FAILED") {
    return new ChatbotToolError("invalid_tool_call", "The chatbot tool call is invalid.");
  }
  return new ChatbotToolError("internal_error", "The chatbot tool could not be completed.");
}
