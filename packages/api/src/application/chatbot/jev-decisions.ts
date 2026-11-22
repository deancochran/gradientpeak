import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { dynamicTool, jsonSchema, type ToolExecutionOptions, type ToolSet } from "ai";
import { z } from "zod";

/** Server-owned, versioned prompts. This deliberately accepts only bounded supplied evidence. */
export const JEV_DECISION_PROMPT_VERSION = "jev-chatbot-decisions-v1";
const NONE_ID = "__none__";
const MAX_CONTEXT_CHARS = 2_000;
const MAX_EVIDENCE_CHARS = 800;
const MAX_TOTAL_CHARS = 7_000;
const MAX_CALLS_PER_TURN = 3;
const RESERVED_IDS = new Set([NONE_ID, "__proto__", "constructor", "prototype"]);

const candidateSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),
    evidence: z.string().min(1).max(MAX_EVIDENCE_CHARS),
  })
  .strict();
const questionSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    question: z.string().min(1).max(500),
  })
  .strict();
export const jevDecisionInputSchema = z
  .object({
    template: z.enum(["select_activity_plan", "identify_session", "check_preferences"]),
    context: z.string().min(1).max(MAX_CONTEXT_CHARS),
    candidates: z.array(candidateSchema).min(1).max(12),
    questions: z.array(questionSchema).max(6).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const candidate of value.candidates) {
      if (RESERVED_IDS.has(candidate.id) || ids.has(candidate.id))
        ctx.addIssue({
          code: "custom",
          message: "candidate IDs must be unique and must not use reserved IDs",
        });
      ids.add(candidate.id);
    }
    const questionIds = new Set<string>();
    for (const question of value.questions) {
      if (RESERVED_IDS.has(question.id) || questionIds.has(question.id))
        ctx.addIssue({
          code: "custom",
          message: "question IDs must be unique and must not use reserved IDs",
        });
      questionIds.add(question.id);
    }
    if (value.template === "check_preferences" && value.questions.length === 0)
      ctx.addIssue({
        code: "custom",
        message: "check_preferences requires at least one bounded condition question",
      });
    const total =
      value.context.length +
      value.candidates.reduce((n, item) => n + item.id.length + item.evidence.length, 0) +
      value.questions.reduce((n, item) => n + item.id.length + item.question.length, 0);
    if (total > MAX_TOTAL_CHARS)
      ctx.addIssue({ code: "custom", message: "decision evidence exceeds the aggregate bound" });
  });

export type JevDecisionInput = z.output<typeof jevDecisionInputSchema>;
export type JevRawDecisionResponse = {
  readonly choice: unknown;
  readonly conditions: Readonly<Record<string, unknown>>;
  readonly usage?: { readonly inputTokens?: number | null; readonly outputTokens?: number | null };
};
export type JevDecisionClient = {
  decide(input: JevDecisionInput, signal: AbortSignal): Promise<JevRawDecisionResponse>;
};
export type JevDecisionResult =
  | {
      readonly status: "selected" | "uncertain";
      readonly candidateId?: string;
      readonly confidence: number;
      readonly probabilities: Readonly<Record<string, number>>;
      readonly conditions: Readonly<
        Record<string, { status: "assessed" | "uncertain"; probability: number }>
      >;
      readonly evidenceLimits: "based only on supplied candidates/context";
    }
  | {
      readonly status: "unavailable";
      readonly evidenceLimits: "based only on supplied candidates/context";
    };

export function createJevDecisionClient(config: {
  apiKey: string;
  modelId: string;
  timeoutMs: number;
}): JevDecisionClient {
  const client = new TypeSafeClient({
    apiKey: config.apiKey,
    defaultModel: config.modelId,
    logLevel: "off",
    retry: { maxRetries: 0 },
    timeout: config.timeoutMs,
  });
  return {
    async decide(input, signal) {
      const criteria: Record<string, string> = Object.create(null);
      for (const candidate of input.candidates) criteria[candidate.id] = candidate.evidence;
      criteria[NONE_ID] =
        "None of the supplied candidates fit the supplied context; abstain rather than inventing one.";
      const questions: Record<string, ReturnType<typeof noul> | ReturnType<typeof choice>> =
        Object.create(null);
      questions.candidate = choice(templateInstruction(input.template), criteria);
      for (const question of input.questions)
        questions[`condition_${question.id}`] = noul(question.question, {
          true: "The supplied context and candidates support yes.",
          false: "The supplied context and candidates do not support yes.",
        });
      const response = await client.systemOne(
        { state: { context: input.context, candidates: input.candidates }, questions },
        { signal, timeout: config.timeoutMs, retry: { maxRetries: 0 } },
      );
      const answers = response.answers as Record<string, unknown>;
      return {
        choice: answers.candidate,
        conditions: Object.fromEntries(
          input.questions.map((question) => [question.id, answers[`condition_${question.id}`]]),
        ),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

export function createJevDecisionTools(options: {
  client: JevDecisionClient;
  signal: AbortSignal;
  maxCalls?: number;
}): ToolSet {
  let calls = 0;
  return {
    jev_decide: dynamicTool({
      description:
        "Optional read-only Jev helper for bounded supplied activity-plan/session candidates or preference conditions. It is not authoritative; use uncertainty to clarify. Sends only this tool's supplied context, candidates, and questions to TypeSafe.",
      inputSchema: jsonSchema(z.toJSONSchema(jevDecisionInputSchema, { io: "input" })),
      execute: async (raw: unknown, execution: ToolExecutionOptions<unknown>) => {
        throwIfAborted(options.signal, execution.abortSignal);
        const parsed = jevDecisionInputSchema.safeParse(raw);
        if (!parsed.success || calls >= (options.maxCalls ?? MAX_CALLS_PER_TURN))
          return unavailable();
        calls += 1;
        try {
          const response = await options.client.decide(
            parsed.data,
            combineSignals(options.signal, execution.abortSignal),
          );
          throwIfAborted(options.signal, execution.abortSignal);
          return mapResponse(parsed.data, response);
        } catch {
          if (options.signal.aborted || execution.abortSignal?.aborted)
            throw new DOMException("Aborted", "AbortError");
          return unavailable();
        }
      },
    }),
  };
}

function templateInstruction(template: JevDecisionInput["template"]): string {
  const subject =
    template === "select_activity_plan"
      ? "activity plan"
      : template === "identify_session"
        ? "session"
        : "candidate matching the supplied preferences";
  return `${JEV_DECISION_PROMPT_VERSION}: Select only the supplied ${subject} ID that best fits the supplied context. Select ${NONE_ID} when evidence is missing, conflicting, or no candidate fits. Do not infer facts beyond supplied context/candidates.`;
}
function mapResponse(input: JevDecisionInput, raw: JevRawDecisionResponse): JevDecisionResult {
  const choice = raw.choice as {
    type?: unknown;
    choice?: unknown;
    confidence?: unknown;
    probabilities?: unknown;
  };
  const keys = [...input.candidates.map((candidate) => candidate.id), NONE_ID];
  if (
    !choice ||
    typeof choice !== "object" ||
    Array.isArray(choice) ||
    choice.type !== "choice" ||
    typeof choice.choice !== "string" ||
    !keys.includes(choice.choice) ||
    !finiteUnit(choice.confidence) ||
    !isDistribution(choice.probabilities, keys)
  )
    return unavailable();
  if (!raw.conditions || typeof raw.conditions !== "object" || Array.isArray(raw.conditions))
    return unavailable();
  const conditions: Record<string, { status: "assessed" | "uncertain"; probability: number }> =
    Object.create(null);
  for (const question of input.questions) {
    const answer = raw.conditions[question.id] as { type?: unknown; noul?: unknown } | undefined;
    if (
      !answer ||
      typeof answer !== "object" ||
      Array.isArray(answer) ||
      answer.type !== "noul" ||
      !finiteUnit(answer.noul)
    )
      return unavailable();
    conditions[question.id] = {
      status: answer.noul >= 0.7 || answer.noul <= 0.3 ? "assessed" : "uncertain",
      probability: answer.noul,
    };
  }
  const selected = choice.choice !== NONE_ID && choice.confidence >= 0.75;
  return {
    status: selected ? "selected" : "uncertain",
    ...(selected ? { candidateId: choice.choice } : {}),
    confidence: choice.confidence,
    probabilities: choice.probabilities as Record<string, number>,
    conditions,
    evidenceLimits: "based only on supplied candidates/context",
  };
}
function isDistribution(value: unknown, keys: readonly string[]): value is Record<string, number> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value as object).length !== keys.length ||
    !keys.every(
      (key) => Object.hasOwn(value, key) && finiteUnit((value as Record<string, unknown>)[key]),
    )
  )
    return false;
  return (
    Math.abs(
      Object.values(value as Record<string, number>).reduce((sum, item) => sum + item, 0) - 1,
    ) <= 0.001
  );
}
function finiteUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function unavailable(): JevDecisionResult {
  return { status: "unavailable", evidenceLimits: "based only on supplied candidates/context" };
}
function throwIfAborted(...signals: (AbortSignal | undefined)[]) {
  if (signals.some((signal) => signal?.aborted)) throw new DOMException("Aborted", "AbortError");
}
function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  return secondary ? AbortSignal.any([primary, secondary]) : primary;
}
