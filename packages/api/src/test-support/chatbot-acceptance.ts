import { MockLanguageModelV4 } from "ai/test";
import {
  type CreateChatbotHostOptions,
  createChatbotHost as createActualChatbotHost,
} from "../application/chatbot/host";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/**
 * Guarded disposable-browser fixture. It composes the production host, HTTP
 * route, authorization, tool registry, and recovery service, replacing only
 * the outbound language model. This module is intentionally test-only.
 */
export function createChatbotAcceptanceHost(options: CreateChatbotHostOptions = {}) {
  assertDisposableFixtureEnvironment();
  return createActualChatbotHost({
    ...options,
    modelRouter: {
      async resolve({ text }) {
        return {
          model: modelFor(text),
          modelId: "disposable-browser-acceptance",
          selectedTier: "fast" as const,
          selectionReason: "fixed" as const,
        };
      },
    },
  });
}

export function assertDisposableFixtureEnvironment(environment = process.env) {
  if (environment.E2E_DISPOSABLE_DATABASE !== "1")
    throw new Error("The chatbot acceptance model is restricted to a disposable E2E database.");
  if (environment.OPENAI_API_KEY || environment.TYPESAFE_API_KEY)
    throw new Error("The chatbot acceptance model refuses provider credentials.");
  const run = /^acceptance-(\d+)-\d+$/.exec(environment.E2E_RUN_ID ?? "");
  let target: URL;
  try {
    target = new URL(environment.DATABASE_URL ?? "");
  } catch {
    throw new Error("The chatbot acceptance model requires the runner-owned database target.");
  }
  if (
    !run ||
    environment.DATABASE_URL !== environment.POSTGRES_URL ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" ||
    !["54322", "55322"].includes(target.port) ||
    !new RegExp(`^/gradientpeak_web_acceptance_${run[1]}_\\d+$`).test(target.pathname) ||
    target.search ||
    target.hash
  )
    throw new Error("The chatbot acceptance model requires the runner-owned database target.");
}

function modelFor(text: string) {
  const slow = text.startsWith("acceptance: slow");
  const actionRecovery = text.startsWith("acceptance: action recovery");
  return new MockLanguageModelV4({
    doStream: actionRecovery
      ? [toolCallResult(), textStreamResult("Acceptance action is streaming", false)]
      : completeOrStalledStream(slow),
  });
}

function completeOrStalledStream(slow: boolean) {
  return textStreamResult(
    slow ? "Acceptance response is streaming" : "Acceptance response complete.",
    !slow,
  );
}

function toolCallResult() {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({
          type: "tool-call",
          toolCallId: "acceptance-diary-call",
          toolName: "api_activities_create-manual-diary-entry",
          input: JSON.stringify({
            observation: {
              activityCategory: "run",
              diaryDate: "2026-10-30",
              diaryTimezone: "UTC",
              name: "Acceptance recovery run",
            },
          }),
        });
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
        });
        controller.close();
      },
    }),
  };
}

function textStreamResult(text: string, finish: boolean) {
  return { stream: textStream(text, finish) };
}

function textStream(text: string, finish: boolean) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "acceptance-response" });
      controller.enqueue({ type: "text-delta", id: "acceptance-response", delta: text });
      if (!finish) return;
      controller.enqueue({ type: "text-end", id: "acceptance-response" });
      controller.enqueue({
        type: "finish",
        finishReason: { unified: "stop", raw: undefined },
        usage,
      });
      controller.close();
    },
  });
}
