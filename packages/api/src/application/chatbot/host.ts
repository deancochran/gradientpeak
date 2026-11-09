import {
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";
import { type ChatbotApiExecutor, createChatbotApiExecutor } from "../../chatbot";
import { createChatbotAiSdkTools } from "../../chatbot/ai-sdk";
import type { ApiContext } from "../../context";
import { type ChatbotHistoryMessage, chatbotRequestSchema } from "../../contracts/chatbot";
import {
  type ChatbotActionRecord,
  type ChatbotHistoryRepository,
  createDrizzleChatbotHistoryRepository,
} from "../../repositories/chatbot-history-repository";
import {
  createJevDecisionClient,
  createJevDecisionTools,
  type JevDecisionClient,
} from "./jev-decisions";
import {
  type ChatbotModelRouter,
  chatbotOpenAIResponsesProviderOptions,
  createChatbotModelRouter,
  loadChatbotProviderConfig,
} from "./model-routing";

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 55_000;
const HISTORY_CHAR_LIMIT = 24_000;
const OUTPUT_CHAR_LIMIT = 16_000;
const CANCEL_CLEANUP_MS = 1_000;

export type ChatbotHostOutcome =
  | {
      readonly kind: "error";
      readonly status: 400 | 401 | 404 | 409 | 500 | 503;
      readonly code: string;
      readonly message: string;
    }
  | {
      readonly kind: "replay";
      readonly threadId: string;
      readonly turnId: string;
      readonly text: string;
    }
  | {
      readonly kind: "recovery";
      readonly threadId: string;
      readonly turnId: string;
      readonly status: "failed" | "interrupted" | "running";
    };

export type CreateChatbotHostOptions = {
  readonly repository?: ChatbotHistoryRepository;
  readonly modelRouter?: ChatbotModelRouter;
  readonly createApiExecutor?: (context: ApiContext) => ChatbotApiExecutor;
  readonly now?: () => Date;
  readonly leaseMs?: number;
  readonly timeoutMs?: number;
  /** Test composition seam; production construction remains server-only below. */
  readonly jevDecisionClient?: JevDecisionClient;
};

/**
 * Server-only turn host. It deliberately returns a route-ready Response or a
 * small transport-neutral outcome; HTTP parsing and status mapping stay outside.
 */
export function createChatbotHost(options: CreateChatbotHostOptions = {}) {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async function host(
    context: ApiContext,
    rawRequest: unknown,
    requestSignal?: AbortSignal,
  ): Promise<Response | ChatbotHostOutcome> {
    const actorId = context.session?.user.id;
    if (!actorId) return error(401, "unauthorized", "Sign in to use the chatbot.");
    // A request already cancelled at the HTTP boundary must not create a turn
    // or resolve a provider; there is no work to recover in this case.
    if (requestSignal?.aborted)
      return error(409, "request_cancelled", "The chatbot request was cancelled.");
    const parsed = chatbotRequestSchema.safeParse(rawRequest);
    if (!parsed.success) return error(400, "invalid_request", "The chatbot request is invalid.");

    // Validate configuration before creating a durable turn. A failed deployment
    // must not leave a request that looks processable but can never be generated.
    let router = options.modelRouter;
    let decisionClient = options.jevDecisionClient;
    try {
      if (!router) {
        const config = loadChatbotProviderConfig();
        if (!config.openaiApiKey) throw new Error("missing OpenAI configuration");
        router = createChatbotModelRouter(config);
        if (config.jevDecisionsEnabled) {
          if (!config.typesafeApiKey) throw new Error("missing TypeSafe configuration");
          decisionClient = createJevDecisionClient({
            apiKey: config.typesafeApiKey,
            modelId: config.jevModelId,
            timeoutMs: config.jevTimeoutMs,
          });
        }
      }
    } catch {
      return error(503, "chatbot_unavailable", "The chatbot is temporarily unavailable.");
    }
    const repository =
      options.repository ??
      (context.db ? createDrizzleChatbotHistoryRepository(context.db) : undefined);
    if (!repository)
      return error(503, "chatbot_unavailable", "The chatbot is temporarily unavailable.");

    let claimed: Awaited<ReturnType<ChatbotHistoryRepository["claim"]>>;
    try {
      claimed = await repository.claim({ actorId, request: parsed.data, now: now(), leaseMs });
    } catch {
      return error(503, "chatbot_unavailable", "The chatbot is temporarily unavailable.");
    }
    if (claimed.kind === "denied")
      return error(404, "not_found", "The chatbot thread is not available.");
    if (claimed.kind === "conflict" || claimed.kind === "active")
      return error(409, "turn_conflict", "A conflicting chatbot request is already in progress.");
    if (claimed.kind === "recovery_required")
      return error(
        409,
        "recovery_required",
        "A previous chatbot action must be recovered before continuing.",
      );
    if (claimed.kind === "duplicate") {
      if (claimed.turn.status === "completed" && claimed.turn.output)
        return {
          kind: "replay",
          threadId: claimed.turn.threadId,
          turnId: claimed.turn.id,
          text: claimed.turn.output.text,
        };
      return {
        kind: "recovery",
        threadId: claimed.turn.threadId,
        turnId: claimed.turn.id,
        status: claimed.turn.status === "completed" ? "failed" : claimed.turn.status,
      };
    }
    if (claimed.kind !== "claimed")
      return error(503, "chatbot_unavailable", "The chatbot is temporarily unavailable.");

    const turn = claimed.turn;
    const controller = new AbortController();
    const onRequestAbort = () => controller.abort();
    requestSignal?.addEventListener("abort", onRequestAbort, { once: true });
    // An abort can win the race between the initial check and listener setup.
    if (requestSignal?.aborted) controller.abort();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      requestSignal?.removeEventListener("abort", onRequestAbort);
    };
    let interruption: Promise<void> | undefined;
    const interrupt = () =>
      (interruption ??= (async () => {
        try {
          await repository.finish({ actorId, turnId: turn.id, status: "interrupted", now: now() });
        } catch {
          // If the database is unavailable, lease expiry is the honest crash-recovery fallback.
        } finally {
          dispose();
        }
      })());
    controller.signal.addEventListener(
      "abort",
      () => {
        void interrupt();
      },
      { once: true },
    );
    let uncertainAction = false;
    const markUncertainAction = () => {
      uncertainAction = true;
      controller.abort();
    };

    try {
      if (controller.signal.aborted) {
        await interrupt();
        return {
          kind: "recovery",
          threadId: turn.threadId,
          turnId: turn.id,
          status: "interrupted",
        };
      }
      const history = await repository.historyForTurn({
        actorId,
        threadId: turn.threadId,
        turnId: turn.id,
      });
      if (!history?.length) throw new Error("missing claimed history");
      throwIfAborted(controller.signal);
      const model = await router.resolve({ signal: controller.signal, text: parsed.data.text });
      throwIfAborted(controller.signal);
      const actions = new Map<string, ChatbotActionRecord>();
      const apiExecutor = options.createApiExecutor?.(context) ?? createChatbotApiExecutor(context);
      const operationIdPaths = new Map(
        apiExecutor
          .listTools()
          .filter((tool) => tool.operation === "write" && "operationIdPath" in tool)
          .map((tool) => [tool.id, tool.operationIdPath] as const),
      );
      const guardedExecutor: ChatbotApiExecutor = {
        listTools: apiExecutor.listTools,
        execute: async (call) => {
          throwIfAborted(controller.signal);
          if (!(await repository.isActive({ actorId, turnId: turn.id, now: now() })))
            throw new Error("chatbot turn is no longer active");
          const action = isChatbotApiCall(call)
            ? findAction(call, actions, operationIdPaths)
            : undefined;
          let dispatched = false;
          try {
            dispatched = true;
            const result = await apiExecutor.execute(call);
            if (
              action &&
              !(await repository.finishAction({
                actorId,
                turnId: turn.id,
                actionId: action.actionId,
                status: "completed",
                result,
                now: now(),
              }))
            ) {
              markUncertainAction();
              throw new Error("action receipt was not completed");
            }
            return result;
          } catch (cause) {
            if (action) {
              // A caller error cannot prove that a mutation did not commit. Keep
              // the receipt recoverable rather than allowing a regenerated call.
              if (dispatched) markUncertainAction();
              try {
                await repository.finishAction({
                  actorId,
                  turnId: turn.id,
                  actionId: action.actionId,
                  status: dispatched ? "unknown" : "failed",
                  result: { message: "Action outcome requires recovery." },
                  now: now(),
                });
              } catch {
                /* durable receipt may be unavailable */
              }
            }
            throw cause;
          }
        },
      };
      const tools = createChatbotAiSdkTools({
        apiExecutor: guardedExecutor,
        signal: controller.signal,
        resolveOperationId: async ({ input, toolCallId, toolId }) => {
          throwIfAborted(controller.signal);
          if (!isRecord(input)) throw new Error("invalid tool input");
          let persisted: ChatbotActionRecord | "conflict" | "denied" | "inactive";
          try {
            persisted = await repository.persistAction({
              actorId,
              turnId: turn.id,
              toolCallId,
              toolId,
              input,
              now: now(),
            });
          } catch (error) {
            // A failed acknowledgement may follow a durable intent insert.  Do not
            // let the model continue or claim that a later completion is safe.
            markUncertainAction();
            throw error;
          }
          throwIfAborted(controller.signal);
          if (typeof persisted === "string") throw new Error("action cannot be safely dispatched");
          actions.set(persisted.actionId, persisted);
          return persisted.actionId;
        },
      });
      const decisionTools = decisionClient
        ? createJevDecisionTools({ client: decisionClient, signal: controller.signal })
        : {};
      const toolNames = new Set(Object.keys(tools.tools));
      for (const name of Object.keys(decisionTools)) {
        if (toolNames.has(name)) throw new Error(`Chatbot provider tool name collision: ${name}`);
      }
      const allTools = { ...tools.tools, ...decisionTools };
      const result = streamText({
        abortSignal: controller.signal,
        messages: boundedMessages(history),
        maxOutputTokens: 2_000,
        maxRetries: 0,
        model: model.model,
        providerOptions: chatbotOpenAIResponsesProviderOptions,
        stopWhen: stepCountIs(5),
        tools: allTools,
        ...(decisionClient
          ? {
              instructions:
                "The optional jev_decide helper is read-only and non-authoritative. When available, prefer bounded candidate evidence from prior authorized reads; do not invent candidates or treat their provenance as verified. Clarify on unavailable or uncertain outcomes. Never treat it as permission, truth, medical advice, exact arithmetic, ownership, or preview authority.",
            }
          : {}),
      });
      const ui = toUIMessageStream({
        stream: result.stream,
        tools: allTools,
        onError: () => "The chatbot response could not be completed.",
      });
      const cancellable = gateCompletion(ui, {
        complete: async (text) => {
          if (uncertainAction || controller.signal.aborted || !text) return false;
          try {
            const completed = await repository.finish({
              actorId,
              turnId: turn.id,
              status: "completed",
              output: { role: "assistant", text },
              now: now(),
            });
            if (completed && !uncertainAction) {
              dispose();
              return true;
            }
          } catch {
            // The stream must report failure rather than success if its durable
            // completion acknowledgement is unavailable.
          }
          return false;
        },
        fail: async () => {
          controller.abort();
          await interrupt();
        },
        signal: controller.signal,
      });
      return createUIMessageStreamResponse({
        stream: cancellable,
        headers: {
          "x-chatbot-request-id": parsed.data.requestId,
          "x-chatbot-thread-id": turn.threadId,
          "x-chatbot-turn-id": turn.id,
        },
      });
    } catch (cause) {
      dispose();
      await interrupt();
      if (isAbortError(cause))
        return {
          kind: "recovery",
          threadId: turn.threadId,
          turnId: turn.id,
          status: "interrupted",
        };
      try {
        await repository.finish({ actorId, turnId: turn.id, status: "failed", now: now() });
      } catch {
        /* lease expiry remains recovery */
      }
      return error(503, "chatbot_unavailable", "The chatbot is temporarily unavailable.");
    }
  };
}

function boundedMessages(history: readonly ChatbotHistoryMessage[]) {
  const selected: ChatbotHistoryMessage[] = [];
  let chars = 0;
  for (const message of [...history].reverse()) {
    if (chars + message.text.length > HISTORY_CHAR_LIMIT && selected.length) break;
    selected.unshift(message);
    chars += message.text.length;
  }
  return selected.map(({ role, text }) => ({ role, content: text }));
}

function findAction(
  call: { readonly name: string; readonly input: unknown },
  actions: ReadonlyMap<string, ChatbotActionRecord>,
  operationIdPaths: ReadonlyMap<string, readonly string[] | undefined>,
): ChatbotActionRecord | undefined {
  const path = operationIdPaths.get(call.name);
  const operationId = path ? ownStringAtPath(call.input, path) : undefined;
  if (!operationId) return undefined;
  const action = actions.get(operationId);
  return action?.toolId === call.name ? action : undefined;
}
function ownStringAtPath(value: unknown, path: readonly string[]): string | undefined {
  let current = value;
  for (const key of path) {
    if (!isRecord(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}
function isChatbotApiCall(
  value: unknown,
): value is { readonly name: string; readonly input: unknown } {
  return isRecord(value) && typeof value.name === "string" && Object.hasOwn(value, "input");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
function error(
  status: 400 | 401 | 404 | 409 | 500 | 503,
  code: string,
  message: string,
): ChatbotHostOutcome {
  return { kind: "error", status, code, message };
}
function gateCompletion(
  stream: ReadableStream<UIMessageChunk>,
  options: {
    readonly complete: (text: string) => Promise<boolean>;
    readonly fail: () => Promise<void>;
    readonly signal: AbortSignal;
  },
): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  let terminal = false;
  let text = "";
  let outputController: ReadableStreamDefaultController<UIMessageChunk> | undefined;
  const fail = async (controller: ReadableStreamDefaultController<UIMessageChunk>) => {
    if (terminal) return;
    terminal = true;
    options.signal.removeEventListener("abort", onAbort);
    await options.fail();
    controller.enqueue({
      type: "error",
      errorText: "The chatbot response could not be completed.",
    });
    controller.enqueue({ type: "abort", reason: "interrupted" });
    controller.close();
    void boundedCancel(reader);
  };
  const onAbort = () => {
    if (outputController) void fail(outputController);
  };
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      outputController = controller;
      if (options.signal.aborted) void fail(controller);
      else options.signal.addEventListener("abort", onAbort, { once: true });
    },
    async pull(controller) {
      if (terminal) return;
      try {
        const next = await reader.read();
        if (next.done) {
          await fail(controller);
          return;
        }
        const chunk = next.value;
        if (chunk.type === "text-delta") {
          const remaining = OUTPUT_CHAR_LIMIT - text.length;
          if (remaining <= 0 || chunk.delta.length > remaining) {
            if (remaining > 0) {
              const delta = chunk.delta.slice(0, remaining);
              text += delta;
              controller.enqueue({ ...chunk, delta });
            }
            await fail(controller);
            return;
          }
          text += chunk.delta;
        }
        if (chunk.type === "finish") {
          if (await options.complete(text.trim())) {
            terminal = true;
            options.signal.removeEventListener("abort", onAbort);
            controller.enqueue(chunk);
            controller.close();
            void boundedCancel(reader);
          } else {
            await fail(controller);
          }
          return;
        }
        if (chunk.type === "error" || chunk.type === "abort") {
          await fail(controller);
          return;
        }
        controller.enqueue(chunk);
      } catch {
        await fail(controller);
      }
    },
    async cancel(reason) {
      if (!terminal) {
        terminal = true;
        options.signal.removeEventListener("abort", onAbort);
        await options.fail();
      }
      await boundedCancel(reader, reason);
    },
  });
}
async function boundedCancel<T>(
  reader: ReadableStreamDefaultReader<T>,
  reason?: unknown,
): Promise<void> {
  await Promise.race([
    reader.cancel(reason).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, CANCEL_CLEANUP_MS)),
  ]);
  try {
    reader.releaseLock();
  } catch {
    /* a pending reader may still own its lock */
  }
}
