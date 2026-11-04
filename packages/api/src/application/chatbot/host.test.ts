import { randomUUID } from "node:crypto";
import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import {
  type ApiChatbotToolDescriptor,
  type ChatbotApiExecutor,
  listApiChatbotTools,
} from "../../chatbot";
import type { ApiContext } from "../../context";
import type { ChatbotHistoryRepository } from "../../repositories/chatbot-history-repository";
import { createChatbotAcceptanceHost } from "../../test-support/chatbot-acceptance";
import { createChatbotHost } from "./host";
import type { JevDecisionClient } from "./jev-decisions";

const actorId = "11111111-1111-4111-8111-111111111111";
const request = { requestId: randomUUID(), text: "Hello" };
const context = { session: { user: { id: actorId } } } as ApiContext;
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function repository(): ChatbotHistoryRepository {
  return {
    claim: async () => ({
      kind: "claimed",
      turn: {
        id: randomUUID(),
        threadId: randomUUID(),
        requestFingerprint: "fingerprint",
        status: "running",
        input: { role: "user", text: "Hello" },
        output: null,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    }),
    finish: async () => true,
    history: async () => null,
    historyForTurn: async () => [{ role: "user", text: "Hello" }],
    isActive: async () => true,
    interruptExpired: async () => 0,
    persistAction: async () => {
      throw new Error("not expected");
    },
    finishAction: async () => true,
    status: async () => null,
    loadRecovery: async () => "missing",
    reconcileAction: async () => false,
    completeRecovery: async () => false,
  };
}

function modelFor(parts: readonly unknown[]) {
  return {
    resolve: async () => ({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              for (const part of parts) controller.enqueue(part as never);
              controller.close();
            },
          }),
        }),
      }),
      modelId: "mock",
      selectedTier: "fast" as const,
      selectionReason: "fixed" as const,
    }),
  };
}

function completedParts(text: string) {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: text },
    { type: "text-end", id: "text" },
    { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
  ];
}
function streamFor(parts: readonly unknown[]) {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}
function toolCallParts(toolName: string, toolCallId: string, input: string) {
  return {
    stream: streamFor([
      { type: "stream-start", warnings: [] },
      { type: "tool-call", toolName, toolCallId, input },
      { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
    ]),
  };
}

describe("chatbot host", () => {
  it("rejects an unauthenticated request before repository or model work", async () => {
    let claims = 0;
    const host = createChatbotHost({
      repository: {
        ...repository(),
        claim: async () => {
          claims += 1;
          throw new Error("unexpected");
        },
      },
      modelRouter: {
        resolve: async () => {
          throw new Error("unexpected");
        },
      },
    });
    await expect(host({ session: null } as ApiContext, request)).resolves.toMatchObject({
      kind: "error",
      status: 401,
    });
    expect(claims).toBe(0);
  });
  it("replays a completed duplicate without resolving a model", async () => {
    let models = 0;
    const turnId = randomUUID();
    const threadId = randomUUID();
    const host = createChatbotHost({
      repository: {
        ...repository(),
        claim: async () => ({
          kind: "duplicate",
          turn: {
            id: turnId,
            threadId,
            requestFingerprint: "x",
            status: "completed",
            input: { role: "user", text: "Hello" },
            output: { role: "assistant", text: "Stored answer" },
            leaseExpiresAt: null,
          },
        }),
      },
      modelRouter: {
        resolve: async () => {
          models += 1;
          throw new Error("unexpected");
        },
      },
    });
    await expect(host(context, request)).resolves.toEqual({
      kind: "replay",
      threadId,
      turnId,
      text: "Stored answer",
    });
    expect(models).toBe(0);
  });
  it("streams and persists a normal model response only after consumer reads it", async () => {
    const finishes: unknown[] = [];
    const host = createChatbotHost({
      repository: {
        ...repository(),
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      modelRouter: {
        resolve: async () => ({
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({ type: "stream-start", warnings: [] });
                  controller.enqueue({ type: "text-start", id: "text" });
                  controller.enqueue({ type: "text-delta", id: "text", delta: "Hello athlete" });
                  controller.enqueue({ type: "text-end", id: "text" });
                  controller.enqueue({
                    type: "finish",
                    finishReason: { unified: "stop", raw: undefined },
                    usage,
                  });
                  controller.close();
                },
              }),
            }),
          }),
          modelId: "mock",
          selectedTier: "fast",
          selectionReason: "fixed" as const,
        }),
      },
    });
    const outcome = await host(context, request);
    expect(outcome).toBeInstanceOf(Response);
    await (outcome as Response).text();
    expect(finishes).toContainEqual(
      expect.objectContaining({
        status: "completed",
        output: { role: "assistant", text: "Hello athlete" },
      }),
    );
  });
  it("allows a first-step advisory Jev helper call without direct server reads", async () => {
    let directReads = 0;
    const readDescriptor: ApiChatbotToolDescriptor = {
      id: "api.test-read",
      description: "A read tool that the model did not call",
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object" },
      operation: "read",
      retrySafety: "retry_safe",
      routerOperation: "calendar.list",
      scope: "api",
      userAuthority: "user",
    };
    const model = new MockLanguageModelV4({
      doStream: [
        toolCallParts(
          "jev_decide",
          "jev-1",
          JSON.stringify({
            template: "select_activity_plan",
            context: "easy run",
            candidates: [
              { id: "easy_run", evidence: "trusted read: 45 minute recovery run" },
              { id: "intervals", evidence: "hard intervals" },
            ],
            questions: [],
          }),
        ),
        { stream: streamFor(completedParts("Choose the easy run.")) },
      ],
    });
    const decisionClient: JevDecisionClient = {
      decide: async () => ({
        choice: {
          type: "choice",
          choice: "easy_run",
          confidence: 0.9,
          probabilities: { easy_run: 0.9, intervals: 0.05, __none__: 0.05 },
        },
        conditions: {},
      }),
    };
    const host = createChatbotHost({
      repository: repository(),
      jevDecisionClient: decisionClient,
      createApiExecutor: () =>
        ({
          listTools: () => [readDescriptor],
          execute: async () => {
            directReads += 1;
            throw new Error("Jev must not cause an arbitrary server read");
          },
        }) as ChatbotApiExecutor,
      modelRouter: {
        resolve: async () => ({
          model,
          modelId: "mock",
          selectedTier: "fast",
          selectionReason: "fixed" as const,
        }),
      },
    });
    const outcome = await host(context, { ...request, requestId: randomUUID() });
    await (outcome as Response).text();
    expect(model.doStreamCalls).toHaveLength(2);
    const finalStep = JSON.stringify(model.doStreamCalls[1]);
    expect(finalStep).toContain("easy_run");
    expect(finalStep).toContain("0.9");
    expect(finalStep).toContain("easy run");
    expect(directReads).toBe(0);
  });
  it("passes trusted read evidence and the exact advisory result through the read-to-Jev-to-LLM loop", async () => {
    let reads = 0;
    let writes = 0;
    const readDescriptor: ApiChatbotToolDescriptor = {
      id: "api.test-read",
      description: "Read trusted candidate evidence",
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object" },
      operation: "read",
      retrySafety: "retry_safe",
      routerOperation: "calendar.list",
      scope: "api",
      userAuthority: "user",
    };
    const model = new MockLanguageModelV4({
      doStream: [
        toolCallParts("api_test-read", "read-1", "{}"),
        toolCallParts(
          "jev_decide",
          "jev-1",
          JSON.stringify({
            template: "select_activity_plan",
            context: "easy run",
            candidates: [
              { id: "easy_run", evidence: "trusted read: 45 minute recovery run" },
              { id: "intervals", evidence: "hard intervals" },
            ],
            questions: [],
          }),
        ),
        { stream: streamFor(completedParts("Choose the easy run.")) },
      ],
    });
    const host = createChatbotHost({
      repository: repository(),
      jevDecisionClient: {
        decide: async () => ({
          choice: {
            type: "choice",
            choice: "easy_run",
            confidence: 0.9,
            probabilities: { easy_run: 0.9, intervals: 0.05, __none__: 0.05 },
          },
          conditions: {},
        }),
      },
      createApiExecutor: () =>
        ({
          listTools: () => [readDescriptor],
          execute: async ({ name }: { name: string }) => {
            if (name !== readDescriptor.id) {
              writes += 1;
              throw new Error("unexpected non-read tool call");
            }
            reads += 1;
            return { evidence: "trusted read: 45 minute recovery run" };
          },
        }) as ChatbotApiExecutor,
      modelRouter: {
        resolve: async () => ({
          model,
          modelId: "mock",
          selectedTier: "fast",
          selectionReason: "fixed" as const,
        }),
      },
    });
    const outcome = await host(context, { ...request, requestId: randomUUID() });
    await (outcome as Response).text();
    expect(reads).toBe(1);
    expect(writes).toBe(0);
    expect(model.doStreamCalls).toHaveLength(3);
    const finalStep = JSON.stringify(model.doStreamCalls[2]);
    expect(finalStep).toContain("easy_run");
    expect(finalStep).toContain("0.9");
    expect(finalStep).toContain("trusted read: 45 minute recovery run");
  });
  it("does not expose the Jev tool when the independent decision client is absent", async () => {
    const model = new MockLanguageModelV4({
      doStream: { stream: streamFor(completedParts("No optional tool.")) },
    });
    const host = createChatbotHost({
      repository: repository(),
      modelRouter: {
        resolve: async () => ({
          model,
          modelId: "mock",
          selectedTier: "fast",
          selectionReason: "fixed" as const,
        }),
      },
    });
    const outcome = await host(context, { ...request, requestId: randomUUID() });
    await (outcome as Response).text();
    expect(JSON.stringify(model.doStreamCalls[0])).not.toContain("jev_decide");
  });
  it("sanitizes unavailable configuration before claiming a turn", async () => {
    let claims = 0;
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const host = createChatbotHost({
        repository: {
          ...repository(),
          claim: async () => {
            claims += 1;
            throw new Error("unexpected");
          },
        },
      });
      await expect(host(context, request)).resolves.toEqual({
        kind: "error",
        status: 503,
        code: "chatbot_unavailable",
        message: "The chatbot is temporarily unavailable.",
      });
      expect(claims).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = saved;
    }
  });
  it("does no durable or provider work when the request is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const finishes: unknown[] = [];
    let claims = 0;
    let resolved = 0;
    const host = createChatbotHost({
      repository: {
        ...repository(),
        claim: async () => {
          claims += 1;
          throw new Error("must not claim");
        },
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      modelRouter: {
        resolve: async () => {
          resolved += 1;
          throw new Error("must not resolve");
        },
      },
    });
    await expect(host(context, request, controller.signal)).resolves.toMatchObject({
      kind: "error",
      code: "request_cancelled",
    });
    expect(resolved).toBe(0);
    expect(claims).toBe(0);
    expect(finishes).toEqual([]);
  });
  it("fails rather than completing when model resolution throws", async () => {
    const finishes: unknown[] = [];
    const host = createChatbotHost({
      repository: {
        ...repository(),
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      modelRouter: {
        resolve: async () => {
          throw new Error("provider unavailable");
        },
      },
    });
    await expect(host(context, request)).resolves.toEqual({
      kind: "error",
      status: 503,
      code: "chatbot_unavailable",
      message: "The chatbot is temporarily unavailable.",
    });
    expect(finishes).toContainEqual(expect.objectContaining({ status: "interrupted" }));
    expect(finishes).toContainEqual(expect.objectContaining({ status: "failed" }));
  });
  it.each([
    false,
    new Error("database unavailable"),
  ])("sends an error protocol, not finish, when durable completion is unavailable (%s)", async (failure) => {
    const finishes: unknown[] = [];
    const host = createChatbotHost({
      repository: {
        ...repository(),
        finish: async (input) => {
          finishes.push(input);
          if (input.status === "completed") {
            if (failure instanceof Error) throw failure;
            return failure;
          }
          return true;
        },
      },
      modelRouter: modelFor(completedParts("Durability first")),
    });
    const response = await host(context, { ...request, requestId: randomUUID() });
    const body = await (response as Response).text();
    expect(body).toContain('"type":"error"');
    expect(body).toContain('"type":"abort"');
    expect(body).not.toContain('"type":"finish"');
    expect(finishes).toContainEqual(expect.objectContaining({ status: "completed" }));
    expect(finishes).toContainEqual(expect.objectContaining({ status: "interrupted" }));
  });
  it("bounds emitted text and interrupts rather than completing oversized output", async () => {
    const finishes: unknown[] = [];
    const host = createChatbotHost({
      repository: {
        ...repository(),
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      modelRouter: modelFor(completedParts("x".repeat(16_001))),
    });
    const response = await host(context, { ...request, requestId: randomUUID() });
    const body = await (response as Response).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"finish"');
    expect(body).toContain("x".repeat(16_000));
    expect(body).not.toContain("x".repeat(16_001));
    expect(finishes).not.toContainEqual(expect.objectContaining({ status: "completed" }));
    expect(finishes).toContainEqual(expect.objectContaining({ status: "interrupted" }));
  });
  it("interrupts on a partial provider error without a normal finish", async () => {
    const finishes: unknown[] = [];
    const host = createChatbotHost({
      repository: {
        ...repository(),
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      modelRouter: modelFor([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "text" },
        { type: "text-delta", id: "text", delta: "Partial" },
        { type: "error", error: new Error("provider lost") },
      ]),
    });
    const response = await host(context, { ...request, requestId: randomUUID() });
    const body = await (response as Response).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"finish"');
    expect(finishes).toContainEqual(expect.objectContaining({ status: "interrupted" }));
  });
  it("interrupts when the response stream is explicitly cancelled", async () => {
    const finishes: unknown[] = [];
    const host = createChatbotHost({
      repository: {
        ...repository(),
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      modelRouter: modelFor(completedParts("Cancellation")),
    });
    const response = await host(context, { ...request, requestId: randomUUID() });
    await (response as Response).body?.cancel("client disconnected");
    await vi.waitFor(() =>
      expect(finishes).toContainEqual(expect.objectContaining({ status: "interrupted" })),
    );
  });
  it("latches an unknown action receipt and prevents a later successful turn finish", async () => {
    const actionId = randomUUID();
    const finishes: unknown[] = [];
    const actionFinishes: unknown[] = [];
    let executions = 0;
    const descriptor: ApiChatbotToolDescriptor = {
      id: "api.test-write",
      description: "Test write",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" }, operationId: { type: "string" } },
        required: ["value", "operationId"],
      },
      operation: "write",
      operationIdPath: ["operationId"],
      outputSchema: { type: "object" },
      retrySafety: "nonretryable",
      routerOperation: "messaging.sendMessage",
      scope: "api",
      userAuthority: "user",
    };
    const model = new MockLanguageModelV4({
      doStream: [
        {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              controller.enqueue({
                type: "tool-call",
                toolCallId: "call-write",
                toolName: "api_test-write",
                input: '{"value":"once"}',
              });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage,
              });
              controller.close();
            },
          }),
        },
        {
          stream: new ReadableStream({
            start(controller) {
              for (const part of completedParts("must not finish"))
                controller.enqueue(part as never);
              controller.close();
            },
          }),
        },
      ],
    });
    const host = createChatbotHost({
      repository: {
        ...repository(),
        persistAction: async () => ({
          id: randomUUID(),
          actionId,
          toolCallId: "call-write",
          toolId: "api.test-write",
          input: { value: "once" },
          status: "pending",
          result: null,
        }),
        finishAction: async (input) => {
          actionFinishes.push(input);
          return false;
        },
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      createApiExecutor: () =>
        ({
          listTools: () => [descriptor],
          execute: async () => {
            executions += 1;
            return { ok: true };
          },
        }) as ChatbotApiExecutor,
      modelRouter: {
        resolve: async () => ({
          model,
          modelId: "mock",
          selectedTier: "fast",
          selectionReason: "fixed" as const,
        }),
      },
    });
    const response = await host(context, { ...request, requestId: randomUUID() });
    const body = await (response as Response).text();
    expect(executions).toBe(1);
    expect(actionFinishes).toContainEqual(
      expect.objectContaining({ status: "completed", actionId }),
    );
    expect(actionFinishes).toContainEqual(expect.objectContaining({ status: "unknown", actionId }));
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"finish"');
    expect(finishes).not.toContainEqual(expect.objectContaining({ status: "completed" }));
    expect(finishes).toContainEqual(expect.objectContaining({ status: "interrupted" }));
  });
  it("the action-recovery fixture emits client-valid diary chunks before its stall", async () => {
    const descriptor = listApiChatbotTools().find(
      (candidate) => candidate.id === "api.activities.create-manual-diary-entry",
    );
    if (!descriptor) throw new Error("Expected the manual diary descriptor");
    const actionId = randomUUID();
    const calls: unknown[] = [];
    const previousDisposable = process.env.E2E_DISPOSABLE_DATABASE;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    const previousTypeSafe = process.env.TYPESAFE_API_KEY;
    const fixtureTarget = {
      E2E_RUN_ID: "acceptance-123-450",
      DATABASE_URL: "postgresql://fixture@127.0.0.1:54322/gradientpeak_web_acceptance_123_456",
      POSTGRES_URL: "postgresql://fixture@127.0.0.1:54322/gradientpeak_web_acceptance_123_456",
    };
    const previousTarget = Object.fromEntries(
      Object.keys(fixtureTarget).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, fixtureTarget);
    process.env.E2E_DISPOSABLE_DATABASE = "1";
    delete process.env.OPENAI_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    const host = createChatbotAcceptanceHost({
      repository: {
        ...repository(),
        persistAction: async (input) => ({
          id: randomUUID(),
          actionId,
          toolCallId: input.toolCallId,
          toolId: input.toolId,
          input: input.input,
          status: "pending",
          result: null,
        }),
      },
      createApiExecutor: () =>
        ({
          listTools: () => [descriptor],
          execute: async (call) => {
            calls.push(call);
            return { activityId: randomUUID() };
          },
        }) as ChatbotApiExecutor,
    });
    try {
      const response = await host(context, {
        ...request,
        requestId: randomUUID(),
        text: "acceptance: action recovery",
      });
      expect(response).toBeInstanceOf(Response);
      if (!(response instanceof Response) || !response.body) throw new Error("Expected SSE body");
      const chunks: Array<{ type: string }> = [];
      const iterator = parseJsonEventStream({
        stream: response.body,
        schema: uiMessageChunkSchema,
      })[Symbol.asyncIterator]();
      try {
        for (;;) {
          const parsed = await iterator.next();
          expect(parsed.done).toBe(false);
          expect(parsed.value?.success).toBe(true);
          if (!parsed.value?.success || !parsed.value.value) continue;
          chunks.push(parsed.value.value);
          if (parsed.value.value.type === "text-delta") break;
        }
      } finally {
        await iterator.return?.();
      }

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        name: "api.activities.create-manual-diary-entry",
        input: { observation: { operationId: actionId } },
      });
      expect(chunks.map((chunk) => chunk.type)).toContain("tool-input-available");
      expect(chunks.map((chunk) => chunk.type)).toContain("tool-output-available");
      expect(chunks.map((chunk) => chunk.type)).toContain("text-delta");
    } finally {
      if (previousDisposable === undefined) delete process.env.E2E_DISPOSABLE_DATABASE;
      else process.env.E2E_DISPOSABLE_DATABASE = previousDisposable;
      if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAi;
      if (previousTypeSafe === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = previousTypeSafe;
      for (const [key, value] of Object.entries(previousTarget)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  it("does not resolve a model when the request aborts while its claim is pending", async () => {
    let resolveClaim:
      | ((value: Awaited<ReturnType<ChatbotHistoryRepository["claim"]>>) => void)
      | undefined;
    let resolved = 0;
    const controller = new AbortController();
    const host = createChatbotHost({
      repository: {
        ...repository(),
        claim: () =>
          new Promise((resolve) => {
            resolveClaim = resolve;
          }),
      },
      modelRouter: {
        resolve: async () => {
          resolved += 1;
          throw new Error("must not resolve");
        },
      },
    });
    const pending = host(context, { ...request, requestId: randomUUID() }, controller.signal);
    controller.abort();
    resolveClaim?.({
      kind: "claimed",
      turn: {
        id: randomUUID(),
        threadId: randomUUID(),
        requestFingerprint: "fingerprint",
        status: "running",
        input: { role: "user", text: "Hello" },
        output: null,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(pending).resolves.toMatchObject({ kind: "recovery", status: "interrupted" });
    expect(resolved).toBe(0);
  });
  it("settles a provider that ignores the total timeout with an interrupted error stream", async () => {
    const finishes: unknown[] = [];
    const host = createChatbotHost({
      repository: {
        ...repository(),
        finish: async (input) => {
          finishes.push(input);
          return true;
        },
      },
      timeoutMs: 0,
      modelRouter: {
        resolve: async () => ({
          model: new MockLanguageModelV4({
            doStream: async () => ({ stream: new ReadableStream({ start() {} }) }),
          }),
          modelId: "mock",
          selectedTier: "fast",
          selectionReason: "fixed",
        }),
      },
    });
    const response = await host(context, { ...request, requestId: randomUUID() });
    const body = await (response as Response).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"finish"');
    expect(finishes).toContainEqual(expect.objectContaining({ status: "interrupted" }));
  });
});
