import { createOpenAI } from "@ai-sdk/openai";
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import type { LanguageModel } from "ai";
import type { ChatbotProviderConfig } from "./provider-config";

export type { ChatbotModelRoutingMode, ChatbotProviderConfig } from "./provider-config";
export { loadChatbotProviderConfig } from "./provider-config";

export type ChatbotModelTier = "fast" | "reasoning";

export type ChatbotModelSelectionReason =
  | "fixed"
  | "jev_fast"
  | "jev_reasoning"
  | "routing_invalid"
  | "routing_timeout"
  | "routing_uncertain"
  | "routing_unavailable";

export type ChatbotModelResolution = {
  readonly model: LanguageModel;
  readonly modelId: string;
  readonly selectedTier: ChatbotModelTier;
  readonly selectionReason: ChatbotModelSelectionReason;
};

export type ChatbotRouteChoice = {
  readonly choice: ChatbotModelTier;
  readonly confidence: number;
};

export interface ChatbotModelChooser {
  choose(input: {
    readonly signal: AbortSignal;
    readonly text: string;
  }): Promise<ChatbotRouteChoice>;
}

export interface ChatbotModelProvider {
  responses(modelId: string): LanguageModel;
}

export type CreateChatbotModelRouterOptions = {
  readonly chooser?: ChatbotModelChooser;
  readonly modelProvider?: ChatbotModelProvider;
};

export interface ChatbotModelRouter {
  resolve(input: {
    readonly signal?: AbortSignal;
    readonly text: string;
  }): Promise<ChatbotModelResolution>;
}

/** Options the host must pass to its AI SDK generation call for OpenAI Responses. */
export const chatbotOpenAIResponsesProviderOptions = {
  openai: { parallelToolCalls: false, store: false },
} as const;

/**
 * Creates a server-only, two-tier OpenAI model router. The classifier sees only
 * the bounded current user text and can only select the configured model IDs.
 * It does not grant tools, authorize actions, or inspect conversation history.
 */
export function createChatbotModelRouter(
  config: ChatbotProviderConfig,
  options: CreateChatbotModelRouterOptions = {},
): ChatbotModelRouter {
  let modelProvider = options.modelProvider;
  let chooser = options.chooser;

  const resolveModel = (tier: ChatbotModelTier, selectionReason: ChatbotModelSelectionReason) => {
    if (!modelProvider) {
      if (!config.openaiApiKey)
        throw new Error("OPENAI_API_KEY must be configured for the chatbot.");
      const openai = createOpenAI({ apiKey: config.openaiApiKey });
      modelProvider = { responses: (modelId) => openai.responses(modelId) };
    }
    const modelId = tier === "fast" ? config.fastModelId : config.reasoningModelId;
    return {
      model: modelProvider.responses(modelId),
      modelId,
      selectedTier: tier,
      selectionReason,
    };
  };

  return {
    async resolve({ signal, text }) {
      throwIfAborted(signal);
      if (config.mode === "fixed") return resolveModel("reasoning", "fixed");

      const boundedText = text.slice(0, config.maxRequestChars);
      if (!chooser && config.typesafeApiKey) chooser = createJevChatbotModelChooser(config);
      if (!chooser) return resolveModel("reasoning", "routing_unavailable");

      try {
        const result = await withTimeout(
          (routingSignal) => {
            if (!chooser) return Promise.resolve(undefined);
            return chooser.choose({ signal: routingSignal, text: boundedText });
          },
          config.jevTimeoutMs,
          signal,
        );
        throwIfAborted(signal);
        if (!isRouteChoice(result)) return resolveModel("reasoning", "routing_invalid");
        if (result.confidence < config.jevConfidenceThreshold)
          return resolveModel("reasoning", "routing_uncertain");
        return resolveModel(result.choice, result.choice === "fast" ? "jev_fast" : "jev_reasoning");
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw abortError();
        return resolveModel(
          "reasoning",
          isTimeoutError(error) ? "routing_timeout" : "routing_unavailable",
        );
      }
    },
  };
}

/** Creates the optional Jev classifier with bounded retries and no SDK debug logging. */
export function createJevChatbotModelChooser(config: ChatbotProviderConfig): ChatbotModelChooser {
  if (!config.typesafeApiKey)
    throw new Error("TYPESAFE_API_KEY must be configured for Jev routing.");
  const client = new TypeSafeClient({
    apiKey: config.typesafeApiKey,
    defaultModel: config.jevModelId,
    logLevel: "off",
    retry: { maxRetries: config.jevMaxRetries },
    timeout: config.jevTimeoutMs,
  });
  return {
    async choose({ signal, text }) {
      const { answers } = await client.systemOne(
        {
          state: { currentUserText: text },
          questions: {
            route: choice(
              "Choose the response tier for `currentUserText` only. Do not infer tool permissions or authorize actions.",
              {
                fast: "A simple conversational, factual, or narrow request that does not need extended reasoning.",
                reasoning:
                  "A complex, ambiguous, multi-step, safety-sensitive, or planning request where the configured reasoning model is preferred.",
              },
            ),
          },
        },
        { signal },
      );
      return { choice: answers.route.choice, confidence: answers.route.confidence };
    },
  };
}

function isRouteChoice(value: unknown): value is ChatbotRouteChoice {
  return (
    typeof value === "object" &&
    value !== null &&
    "choice" in value &&
    "confidence" in value &&
    ((value as { choice?: unknown }).choice === "fast" ||
      (value as { choice?: unknown }).choice === "reasoning") &&
    typeof (value as { confidence?: unknown }).confidence === "number" &&
    Number.isFinite((value as { confidence: number }).confidence) &&
    (value as { confidence: number }).confidence >= 0 &&
    (value as { confidence: number }).confidence <= 1
  );
}

function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T | undefined>,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<T | undefined> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: (value: T | undefined) => void, value: T | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abort);
      callback(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abort);
      reject(error);
    };
    const abort = () => {
      controller.abort();
      fail(abortError());
    };
    const timer = setTimeout(() => {
      controller.abort();
      fail(new RoutingTimeoutError());
    }, timeoutMs);
    callerSignal?.addEventListener("abort", abort, { once: true });
    if (callerSignal?.aborted) return abort();
    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => settle(resolve, value),
        (error: unknown) => fail(error),
      );
  });
}

class RoutingTimeoutError extends Error {}

function isTimeoutError(error: unknown): boolean {
  return error instanceof RoutingTimeoutError;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}
