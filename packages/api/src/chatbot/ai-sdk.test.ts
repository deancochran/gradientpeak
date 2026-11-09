import { listCoreChatbotTools } from "@repo/core/chatbot";
import { generateText, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createApiContext } from "../context";
import { createChatbotAiSdkTools } from "./ai-sdk";
import { type ChatbotApiExecutor, createChatbotApiExecutor, listApiChatbotTools } from "./index";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function apiExecutor(
  execute: ChatbotApiExecutor["execute"] = async (call) => call,
): ChatbotApiExecutor {
  return { execute, listTools: listApiChatbotTools };
}

async function executeDynamicTool(
  tools: ToolSet,
  name: string,
  input: unknown,
  options: { abortSignal?: AbortSignal; toolCallId?: string } = {},
): Promise<unknown> {
  const tool = tools[name];
  if (!tool || !("execute" in tool) || typeof tool.execute !== "function")
    throw new Error(`Missing executable tool: ${name}`);
  return tool.execute(input, {
    context: undefined,
    messages: [],
    toolCallId: options.toolCallId ?? "call-1",
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  });
}

function jsonSchemaOf(inputSchema: unknown): unknown | PromiseLike<unknown> {
  if (typeof inputSchema !== "object" || inputSchema === null || !("jsonSchema" in inputSchema))
    throw new Error("Expected AI SDK JSON Schema");
  return inputSchema.jsonSchema as unknown | PromiseLike<unknown>;
}

describe("AI SDK chatbot adapter", () => {
  it("maps every existing capability to a stable provider-safe name", () => {
    const adapter = createChatbotAiSdkTools({
      apiExecutor: apiExecutor(),
      resolveOperationId: async () => "22222222-2222-4222-8222-222222222222",
    });
    expect(adapter.metadata).toHaveLength(
      listApiChatbotTools().length + listCoreChatbotTools().length,
    );
    expect(adapter.metadata.map((tool) => tool.name)).toEqual(
      adapter.metadata.map((tool) => tool.canonicalId.replaceAll(".", "_")),
    );
    expect(adapter.metadata.every((tool) => /^[A-Za-z0-9_-]{1,64}$/.test(tool.name))).toBe(true);
    expect(adapter.nameToCanonicalId.get("core_estimate-max-heart-rate")).toBe(
      "core.estimate-max-heart-rate",
    );
  });

  it("requires a stable host resolver before exposing writes and rejects ambiguous descriptors", () => {
    expect(() => createChatbotAiSdkTools({ apiExecutor: apiExecutor() })).toThrow(
      "resolveOperationId",
    );
    const read = listCoreChatbotTools()[0];
    if (!read) throw new Error("Expected Core tool");
    expect(() =>
      createChatbotAiSdkTools({
        apiExecutor: apiExecutor(),
        descriptors: [read, read],
      }),
    ).toThrow("Duplicate chatbot tool id");
  });

  it("uses a real AI SDK mocked model to call the existing Core executor", async () => {
    const adapter = createChatbotAiSdkTools({
      apiExecutor: apiExecutor(),
      resolveOperationId: async () => "22222222-2222-4222-8222-222222222222",
    });
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [
            {
              input: '{"ageYears":40}',
              toolCallId: "call-core",
              toolName: "core_estimate-max-heart-rate",
              type: "tool-call",
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        }),
      }),
      prompt: "Calculate an estimate.",
      tools: adapter.tools,
    });
    expect(result.toolResults).toMatchObject([
      { output: { maxHeartRateBpm: 180, method: "age-based-estimate" } },
    ]);
  });

  it("uses a real AI SDK mocked model to inject a host UUID into the existing API executor", async () => {
    const actorId = "11111111-1111-4111-8111-111111111111";
    const messageDescriptor = listApiChatbotTools().find(
      (tool) => tool.id === "api.messaging.send-message",
    );
    if (!messageDescriptor) throw new Error("Expected message descriptor");
    const received: unknown[] = [];
    const apiExecutor = createChatbotApiExecutor(
      await createApiContext({
        headers: new Headers(),
        auth: {
          session: {
            sessionId: "session",
            transport: "cookie",
            user: { id: actorId, email: "athlete@example.test", emailVerified: true },
          },
        },
      }),
      {
        createCaller: () => ({
          messaging: {
            sendMessage: async (input) => {
              received.push(input);
              return { success: true };
            },
          },
        }),
      },
    );
    const adapter = createChatbotAiSdkTools({
      apiExecutor,
      descriptors: [messageDescriptor],
      resolveOperationId: async () => "22222222-2222-4222-8222-222222222222",
    });
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [
            {
              input:
                '{"conversation_id":"33333333-3333-4333-8333-333333333333","content":"host key"}',
              toolCallId: "call-api",
              toolName: "api_messaging_send-message",
              type: "tool-call",
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        }),
      }),
      prompt: "Send a message.",
      tools: adapter.tools,
    });
    expect(result.toolResults).toMatchObject([{ output: { success: true } }]);
    expect(received).toEqual([
      {
        content: "host key",
        conversation_id: "33333333-3333-4333-8333-333333333333",
        operation_id: "22222222-2222-4222-8222-222222222222",
      },
    ]);
  });

  it("hides, rejects, and host-injects write operation IDs without mutating descriptors", async () => {
    const calls: unknown[] = [];
    const descriptor = listApiChatbotTools().find(
      (tool) => tool.id === "api.messaging.send-message",
    );
    if (!descriptor) throw new Error("Expected message descriptor");
    const originalSchema = structuredClone(descriptor.inputSchema);
    const adapter = createChatbotAiSdkTools({
      apiExecutor: apiExecutor(async (call) => {
        calls.push(call);
        return { success: true };
      }),
      descriptors: [descriptor],
      resolveOperationId: async () => "a".repeat(32),
    });
    const modelTool = adapter.tools["api_messaging_send-message"];
    if (!modelTool) throw new Error("Expected model tool");
    const modelSchema = await Promise.resolve(jsonSchemaOf(modelTool.inputSchema));
    expect(modelSchema).toMatchObject({
      properties: { content: expect.anything(), conversation_id: expect.anything() },
      required: expect.arrayContaining(["content", "conversation_id"]),
    });
    expect(
      (modelSchema as { properties?: Record<string, unknown> }).properties?.operationId,
    ).toBeUndefined();
    expect((modelSchema as { required?: unknown[] }).required).not.toContain("operationId");
    await expect(
      executeDynamicTool(adapter.tools, "api_messaging_send-message", {
        content: "hello",
        conversation_id: "22222222-2222-4222-8222-222222222222",
        operationId: "attacker-selected",
      }),
    ).rejects.toMatchObject({ code: "invalid_tool_call" });
    await expect(
      executeDynamicTool(adapter.tools, "api_messaging_send-message", {
        content: "hello",
        conversation_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toEqual({ success: true });
    await expect(
      executeDynamicTool(adapter.tools, "api_messaging_send-message", {
        content: "hello",
        conversation_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toEqual({ success: true });
    expect(calls).toEqual([
      {
        input: {
          content: "hello",
          conversation_id: "22222222-2222-4222-8222-222222222222",
          operationId: "a".repeat(32),
        },
        name: "api.messaging.send-message",
      },
      {
        input: {
          content: "hello",
          conversation_id: "22222222-2222-4222-8222-222222222222",
          operationId: "a".repeat(32),
        },
        name: "api.messaging.send-message",
      },
    ]);
    expect(descriptor.inputSchema).toEqual(originalSchema);
  });

  it("injects nested diary IDs and checks cancellation before resolver and dispatch", async () => {
    const descriptor = listApiChatbotTools().find(
      (tool) => tool.id === "api.activities.create-manual-diary-entry",
    );
    if (!descriptor) throw new Error("Expected diary descriptor");
    const calls: unknown[] = [];
    let resolverCalls = 0;
    const controller = new AbortController();
    const adapter = createChatbotAiSdkTools({
      apiExecutor: apiExecutor(async (call) => {
        calls.push(call);
        return { outcome: "created" };
      }),
      descriptors: [descriptor],
      resolveOperationId: async () => {
        resolverCalls += 1;
        return "22222222-2222-4222-8222-222222222222";
      },
    });
    const modelTool = adapter.tools["api_activities_create-manual-diary-entry"];
    if (!modelTool) throw new Error("Expected diary model tool");
    const modelSchema = await Promise.resolve(jsonSchemaOf(modelTool.inputSchema));
    const observation = (modelSchema as { properties?: Record<string, unknown> }).properties
      ?.observation as { properties?: Record<string, unknown>; required?: unknown[] } | undefined;
    expect((modelSchema as { required?: unknown[] }).required).toContain("observation");
    expect(observation?.properties?.operationId).toBeUndefined();
    expect(observation?.required).not.toContain("operationId");
    await expect(
      executeDynamicTool(adapter.tools, "api_activities_create-manual-diary-entry", {
        observation: { operationId: "attacker-selected" },
      }),
    ).rejects.toMatchObject({ code: "invalid_tool_call" });
    expect(resolverCalls).toBe(0);
    await executeDynamicTool(adapter.tools, "api_activities_create-manual-diary-entry", {
      observation: {
        activityCategory: "run",
        diaryDate: "2026-01-01",
        diaryTimezone: "UTC",
        name: "Diary",
      },
    });
    expect(calls[0]).toMatchObject({
      input: { observation: { operationId: "22222222-2222-4222-8222-222222222222" } },
    });
    expect(resolverCalls).toBe(1);
    controller.abort();
    await expect(
      executeDynamicTool(
        adapter.tools,
        "api_activities_create-manual-diary-entry",
        { observation: {} },
        { abortSignal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(1);
  });

  it("keeps retry IDs host-stable, preserves API validation, and stops after resolver cancellation", async () => {
    let dispatches = 0;
    const context = await createApiContext({ headers: new Headers() });
    const messageDescriptor = listApiChatbotTools().find(
      (tool) => tool.id === "api.messaging.send-message",
    );
    if (!messageDescriptor) throw new Error("Expected message descriptor");
    const executor = createChatbotApiExecutor(context, {
      createCaller: () => ({
        messaging: {
          sendMessage: async () => {
            dispatches += 1;
            return { success: true };
          },
        },
      }),
    });
    const invalid = createChatbotAiSdkTools({
      apiExecutor: executor,
      descriptors: [messageDescriptor],
      resolveOperationId: async () => "not-a-valid-operation-id",
    });
    await expect(
      executeDynamicTool(invalid.tools, "api_messaging_send-message", {
        content: "hello",
        conversation_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toMatchObject({ code: "invalid_tool_call" });
    expect(dispatches).toBe(0);

    let releaseResolver: (() => void) | undefined;
    const pendingResolver = new Promise<void>((resolve) => {
      releaseResolver = resolve;
    });
    const controller = new AbortController();
    const cancelled = createChatbotAiSdkTools({
      apiExecutor: apiExecutor(async () => {
        dispatches += 1;
        return { success: true };
      }),
      descriptors: [messageDescriptor],
      resolveOperationId: async () => {
        await pendingResolver;
        return "a".repeat(32);
      },
    });
    const running = executeDynamicTool(
      cancelled.tools,
      "api_messaging_send-message",
      { content: "hello", conversation_id: "22222222-2222-4222-8222-222222222222" },
      { abortSignal: controller.signal },
    );
    controller.abort();
    releaseResolver?.();
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(dispatches).toBe(0);
  });

  it("preserves normal authorization errors and sanitizes resolver and executor failures", async () => {
    const notificationDescriptor = listApiChatbotTools().find(
      (tool) => tool.id === "api.notifications.get-unread-count",
    );
    const messageDescriptor = listApiChatbotTools().find(
      (tool) => tool.id === "api.messaging.send-message",
    );
    if (!notificationDescriptor || !messageDescriptor) throw new Error("Expected descriptors");
    const unauthorized = createChatbotAiSdkTools({
      apiExecutor: createChatbotApiExecutor(await createApiContext({ headers: new Headers() })),
      descriptors: [notificationDescriptor],
    });
    await expect(
      executeDynamicTool(unauthorized.tools, "api_notifications_get-unread-count", {}),
    ).rejects.toMatchObject({ code: "unauthorized" });

    const resolverFailure = createChatbotAiSdkTools({
      apiExecutor: apiExecutor(),
      descriptors: [messageDescriptor],
      resolveOperationId: async () => Promise.reject(new Error("resolver secret")),
    });
    const executorFailure = createChatbotAiSdkTools({
      apiExecutor: apiExecutor(async () => Promise.reject(new Error("executor secret"))),
      descriptors: [messageDescriptor],
      resolveOperationId: async () => "a".repeat(32),
    });
    for (const adapter of [resolverFailure, executorFailure]) {
      await expect(
        executeDynamicTool(adapter.tools, "api_messaging_send-message", {
          content: "hello",
          conversation_id: "22222222-2222-4222-8222-222222222222",
        }),
      ).rejects.toMatchObject({
        code: "internal_error",
        message: "The chatbot tool could not be completed.",
      });
    }
  });
});
