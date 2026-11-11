import { z } from "zod";
import { compileActivityPlan } from "../activity-plan/compile";
import { activityPlanStructureSchema } from "../activity-plan/structure-schema";
import { calculateActivityPlanStats } from "../activity-plan-calculations";
import {
  calculateCyclingNormalizedPower,
  cyclingNormalizedPowerResultSchema,
  cyclingNormalizedPowerSampleSchema,
} from "../calculations/normalized-power";
import {
  activityPlanDurationEstimateSchema,
  estimateActivityPlanDuration,
} from "../duration/estimate";
import { estimateMaxHR } from "../estimators/onboarding";

export { type ChatbotCanonicalJson, canonicalJson, receiptFingerprint } from "./operation-receipt";

/** Transport-neutral metadata intended for model and adapter discovery. */
export const chatbotToolDescriptorSchema = z
  .object({
    description: z.string().trim().min(1).max(1_000),
    id: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/),
    inputSchema: z.record(z.string(), z.unknown()),
    operation: z.enum(["read", "write"]),
    outputSchema: z.record(z.string(), z.unknown()),
    retrySafety: z.enum(["retry_safe", "nonretryable"]),
    scope: z.enum(["core", "api"]),
    userAuthority: z.literal("user"),
  })
  .strict();
export type ChatbotToolDescriptor = z.infer<typeof chatbotToolDescriptorSchema>;

type AnyZodSchema = z.ZodType<unknown, unknown>;

export type ChatbotToolDefinition<
  TInputSchema extends AnyZodSchema,
  TOutputSchema extends AnyZodSchema,
  TContext = undefined,
> = {
  readonly descriptor: ChatbotToolDescriptor;
  /** Receives validated input and only the trusted execution context supplied by the registry. */
  readonly execute: (
    context: TContext,
    input: z.output<TInputSchema>,
  ) => z.input<TOutputSchema> | Promise<z.input<TOutputSchema>>;
  /** Locally typed execution with the same input and output validation as unknown dispatch. */
  readonly executeValidated: (
    context: TContext,
    input: z.input<TInputSchema>,
  ) => Promise<z.output<TOutputSchema>>;
  readonly executeParsed: (context: TContext, input: unknown) => Promise<z.output<TOutputSchema>>;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
};

type ChatbotToolDefinitionOptions<
  TInputSchema extends AnyZodSchema,
  TOutputSchema extends AnyZodSchema,
  TContext,
> = {
  description: string;
  execute: (
    context: TContext,
    input: z.output<TInputSchema>,
  ) => z.input<TOutputSchema> | Promise<z.input<TOutputSchema>>;
  id: string;
  inputSchema: TInputSchema;
  operation: "read" | "write";
  outputSchema: TOutputSchema;
  retrySafety: "retry_safe" | "nonretryable";
  scope: "core" | "api";
};

function jsonSchemaFor(schema: AnyZodSchema, io: "input" | "output"): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io });
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Chatbot tool ${io} schema cannot be represented as JSON Schema${detail}`);
  }
}

/** Builds a typed, validated, and discoverable tool without scanning comments. */
export function defineChatbotTool<
  TInputSchema extends AnyZodSchema,
  TOutputSchema extends AnyZodSchema,
  TContext = undefined,
>(
  definition: ChatbotToolDefinitionOptions<TInputSchema, TOutputSchema, TContext>,
): ChatbotToolDefinition<TInputSchema, TOutputSchema, TContext> {
  const descriptor = chatbotToolDescriptorSchema.parse({
    description: definition.description,
    id: definition.id,
    inputSchema: jsonSchemaFor(definition.inputSchema, "input"),
    operation: definition.operation,
    outputSchema: jsonSchemaFor(definition.outputSchema, "output"),
    retrySafety: definition.retrySafety,
    scope: definition.scope,
    userAuthority: "user",
  });
  const executeParsed = async (
    context: TContext,
    input: unknown,
  ): Promise<z.output<TOutputSchema>> => {
    const parsedInput = parseToolInput(definition.inputSchema, input);
    return parseToolOutput(definition.outputSchema, await definition.execute(context, parsedInput));
  };
  return {
    ...definition,
    descriptor,
    executeParsed,
    executeValidated: (context, input) => executeParsed(context, input),
  };
}

type RegisteredChatbotTool<TContext> = Pick<
  ChatbotToolDefinition<AnyZodSchema, AnyZodSchema, TContext>,
  "descriptor" | "executeParsed"
>;

/** Creates an explicit allowlist. Duplicate IDs fail during construction, never at dispatch. */
export function createChatbotToolRegistry<TContext>(
  tools: readonly RegisteredChatbotTool<TContext>[],
) {
  const byId = new Map<string, RegisteredChatbotTool<TContext>>();
  for (const tool of tools) {
    if (byId.has(tool.descriptor.id)) {
      throw new Error(`Duplicate chatbot tool id: ${tool.descriptor.id}`);
    }
    byId.set(tool.descriptor.id, tool);
  }

  return {
    execute: async (context: TContext, call: unknown): Promise<unknown> => {
      const parsedCall = parseChatbotToolCall(call);
      const tool = byId.get(parsedCall.name);
      if (!tool) {
        throw new ChatbotToolError("unknown_tool", "The requested chatbot tool is not available.");
      }
      return tool.executeParsed(context, parsedCall.input);
    },
    listTools: (): readonly ChatbotToolDescriptor[] => tools.map((tool) => tool.descriptor),
  };
}

export const chatbotToolCallSchema = z
  .object({
    input: z.unknown(),
    name: z.string().min(1).max(120),
  })
  .strict();

/** Adapter-facing errors never include raw Zod issues or user-provided payloads. */
export class ChatbotToolError extends Error {
  constructor(
    public readonly code:
      | "internal_error"
      | "conflict"
      | "forbidden"
      | "invalid_tool_call"
      | "invalid_tool_output"
      | "not_found"
      | "rate_limited"
      | "unauthorized"
      | "unknown_tool",
    message: string,
  ) {
    super(message);
    this.name = "ChatbotToolError";
  }
}

const normalizedPowerToolInputSchema = z
  .object({ samples: z.array(cyclingNormalizedPowerSampleSchema).max(10_000) })
  .strict();
const estimateMaxHeartRateInputSchema = z
  .object({ ageYears: z.number().finite().int().min(1).max(120) })
  .strict();
const estimateMaxHeartRateOutputSchema = z
  .object({
    maxHeartRateBpm: z.number().finite().positive(),
    method: z.literal("age-based-estimate"),
  })
  .strict();
const activityPlanValidationInputSchema = z.object({ structure: z.unknown() }).strict();
const activityPlanValidationOutputSchema = z
  .object({
    valid: z.boolean(),
    issues: z
      .array(
        z.object({ code: z.string().max(80), path: z.array(z.string().max(80)).max(12) }).strict(),
      )
      .max(20),
  })
  .strict();
const activityPlanSummaryInputSchema = z
  .object({ structure: activityPlanStructureSchema })
  .strict();
const activityPlanSummaryOutputSchema = z
  .object({
    activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]),
    occurrenceCount: z.number().int().nonnegative(),
    exactElapsedSeconds: z.number().int().positive().nullable(),
    timedActiveSeconds: z.number().int().nonnegative(),
    restSeconds: z.number().int().nonnegative(),
    distanceMeters: z.number().int().nonnegative(),
    repetitionCount: z.number().int().nonnegative(),
  })
  .strict();
const activityPlanDurationEstimateInputSchema = z
  .object({ structure: activityPlanStructureSchema })
  .strict();

function sanitizedActivityPlanIssues(structure: unknown) {
  const parsed = activityPlanStructureSchema.safeParse(structure);
  if (parsed.success) return [];
  return parsed.error.issues.slice(0, 20).map((value) => ({
    code:
      "params" in value &&
      typeof value.params === "object" &&
      value.params !== null &&
      "activityPlanIssueCode" in value.params &&
      typeof value.params.activityPlanIssueCode === "string"
        ? value.params.activityPlanIssueCode
        : value.code,
    path: value.path.slice(0, 12).map(String),
  }));
}

/** Pure calculations only; no AI, network, database, or application state is involved. */
export const coreChatbotTools = [
  defineChatbotTool({
    description: "Calculate cycling Normalized Power from timestamped power samples.",
    execute: (_context, input) => calculateCyclingNormalizedPower(input),
    id: "core.cycling-normalized-power",
    inputSchema: normalizedPowerToolInputSchema,
    operation: "read",
    outputSchema: cyclingNormalizedPowerResultSchema,
    retrySafety: "retry_safe",
    scope: "core",
  }),
  defineChatbotTool({
    description: "Estimate maximum heart rate from an athlete age in whole years.",
    execute: (_context, { ageYears }) => ({
      maxHeartRateBpm: estimateMaxHR(ageYears).value,
      method: "age-based-estimate" as const,
    }),
    id: "core.estimate-max-heart-rate",
    inputSchema: estimateMaxHeartRateInputSchema,
    operation: "read",
    outputSchema: estimateMaxHeartRateOutputSchema,
    retrySafety: "retry_safe",
    scope: "core",
  }),
  defineChatbotTool({
    description:
      "Validate an activity-plan structure and return only bounded issue codes and field paths, never submitted content.",
    execute: (_context, { structure }) => {
      const issues = sanitizedActivityPlanIssues(structure);
      return { valid: issues.length === 0, issues };
    },
    id: "core.validate-activity-plan",
    inputSchema: activityPlanValidationInputSchema,
    operation: "read",
    outputSchema: activityPlanValidationOutputSchema,
    retrySafety: "retry_safe",
    scope: "core",
  }),
  defineChatbotTool({
    description:
      "Compile a valid activity plan and summarize only authored completion quantities; it does not estimate training load.",
    execute: (_context, { structure }) => {
      const stats = calculateActivityPlanStats(compileActivityPlan(structure));
      return {
        activityCategory: structure.activity_category,
        occurrenceCount: stats.occurrenceCount,
        exactElapsedSeconds: stats.duration.exactElapsedSeconds,
        timedActiveSeconds: stats.duration.timedActiveSeconds,
        restSeconds: stats.duration.restSeconds,
        distanceMeters: stats.duration.distanceMeters,
        repetitionCount: stats.duration.repetitionCount,
      };
    },
    id: "core.summarize-activity-plan",
    inputSchema: activityPlanSummaryInputSchema,
    operation: "read",
    outputSchema: activityPlanSummaryOutputSchema,
    retrySafety: "retry_safe",
    scope: "core",
  }),
  defineChatbotTool({
    description:
      "Estimate elapsed duration from explicit time or the existing strength-repetition policy; otherwise report unavailable without guessing pace.",
    execute: (_context, { structure }) =>
      estimateActivityPlanDuration({ compiledPlan: compileActivityPlan(structure) }),
    id: "core.estimate-activity-plan-duration",
    inputSchema: activityPlanDurationEstimateInputSchema,
    operation: "read",
    outputSchema: activityPlanDurationEstimateSchema,
    retrySafety: "retry_safe",
    scope: "core",
  }),
] as const;

const coreChatbotToolRegistry = createChatbotToolRegistry(coreChatbotTools);

export function listCoreChatbotTools(): readonly ChatbotToolDescriptor[] {
  return coreChatbotToolRegistry.listTools();
}

/** Validates an untrusted call and executes only an explicitly registered Core tool. */
export async function executeCoreChatbotTool(call: unknown): Promise<unknown> {
  try {
    return await coreChatbotToolRegistry.execute(undefined, call);
  } catch (error) {
    if (error instanceof ChatbotToolError) throw error;
    throw new ChatbotToolError("internal_error", "The chatbot tool could not be completed.");
  }
}

export function parseChatbotToolCall(call: unknown): z.output<typeof chatbotToolCallSchema> {
  const result = chatbotToolCallSchema.safeParse(call);
  if (!result.success)
    throw new ChatbotToolError("invalid_tool_call", "The chatbot tool call is invalid.");
  return result.data;
}

export function parseToolInput<TSchema extends AnyZodSchema>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ChatbotToolError("invalid_tool_call", "The chatbot tool input is invalid.");
  return result.data;
}

export function parseToolOutput<TSchema extends AnyZodSchema>(
  schema: TSchema,
  output: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(output);
  if (!result.success) {
    throw new ChatbotToolError(
      "invalid_tool_output",
      "The chatbot tool returned an invalid result.",
    );
  }
  return result.data;
}
