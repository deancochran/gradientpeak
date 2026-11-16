import { ChatbotToolError, createChatbotToolRegistry } from "@repo/core/chatbot";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { apiCapabilityCatalog, apiRouterInventory } from "../capabilities/generated";
import { createApiContext } from "../context";
import { createChatbotApiExecutor, defineApiReadTool, listApiChatbotTools } from "./index";

describe("API chatbot executor", () => {
  const actorId = "11111111-1111-4111-8111-111111111111";
  const actorContext = () =>
    createApiContext({
      headers: new Headers(),
      auth: {
        session: {
          sessionId: "session",
          user: { id: actorId, email: "athlete@example.test", emailVerified: true },
          transport: "cookie",
        },
      },
    });
  it("is available through the public package subpath", async () => {
    const chatbot = await import("@repo/api/chatbot");
    expect(chatbot.createChatbotApiExecutor).toBe(createChatbotApiExecutor);
  });

  it("publishes a serializable, explicit allowlist with durable write tools", () => {
    const tools = listApiChatbotTools();
    expect(JSON.parse(JSON.stringify(tools))).toEqual(tools);
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "api.notifications.get-unread-count",
          operation: "read",
          routerOperation: "notifications.getUnreadCount",
          retrySafety: "retry_safe",
          userAuthority: "user",
        }),
        expect.objectContaining({ id: "api.goals.list-own", routerOperation: "goals.list" }),
        expect.objectContaining({
          id: "api.activity-plans.create",
          operation: "write",
          retrySafety: "retry_safe",
          routerOperation: "activityPlans.create",
        }),
        expect.objectContaining({ id: "api.planned-sessions.create", operation: "write" }),
        expect.objectContaining({
          id: "api.activities.create-manual-diary-entry",
          operation: "write",
        }),
        expect.objectContaining({ id: "api.messaging.send-message", operation: "write" }),
        expect.objectContaining({ id: "api.training-plans.commit", operation: "write" }),
        expect.objectContaining({ id: "api.training-plans.apply-application", operation: "write" }),
        expect.objectContaining({
          id: "api.planned-sessions.range-own",
          routerOperation: "plannedSessions.range",
        }),
      ]),
    );
    expect(tools[0]?.inputSchema).toEqual(z.toJSONSchema(z.object({}).strict(), { io: "input" }));
    const routerOperation = tools.find(
      (tool) => tool.id === "api.notifications.get-unread-count",
    )?.routerOperation;
    expect(apiRouterInventory.find((item) => item.id === routerOperation)?.procedureType).toBe(
      "query",
    );
    const capability = apiCapabilityCatalog.find((item) => item.id === routerOperation);
    expect(capability).toMatchObject({
      access: "authenticated_session",
      authorizationAssurance: "authentication_boundary",
      procedureType: "query",
    });
    expect(capability?.mutationSafety).toBeUndefined();
  });

  it("delegates authorization to the normal appRouter caller", async () => {
    const executor = createChatbotApiExecutor(await createApiContext({ headers: new Headers() }));

    await expect(
      executor.execute({ input: {}, name: "api.notifications.get-unread-count" }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("uses the trusted context's existing user and router implementation", async () => {
    const context = await createApiContext({ headers: new Headers() });
    const executor = createChatbotApiExecutor(context, {
      createCaller: () => ({ notifications: { getUnreadCount: async () => 3 } }),
    });

    const result = await executor.execute({
      input: {},
      name: "api.notifications.get-unread-count",
    });
    expect(result).toBe(3);
    expect(JSON.parse(JSON.stringify(result))).toBe(3);
  });

  it("passes transformed and defaulted parsed input to an API definition handler", async () => {
    const inputSchema = z.object({ page: z.coerce.number().int().default(1) });
    const outputSchema = z.object({ page: z.number() });
    const tool = defineApiReadTool({
      description: "Reads a page with a defaulted, normalized page number.",
      execute: async (_caller, input) => {
        expectTypeOf(input).toEqualTypeOf<{ page: number }>();
        return { page: input.page };
      },
      id: "api.notifications.defaulted-page",
      inputSchema,
      outputSchema,
      routerOperation: "notifications.getUnreadCount",
    });
    const registry = createChatbotToolRegistry([tool]);
    const caller = { notifications: { getUnreadCount: async () => 3 } };

    await expect(
      registry.execute({ actorProfileId: null, caller }, { input: {}, name: tool.descriptor.id }),
    ).resolves.toEqual({
      page: 1,
    });
    expect(tool.descriptor.inputSchema).toEqual(z.toJSONSchema(inputSchema, { io: "input" }));
    expect(tool.descriptor.outputSchema).toEqual(z.toJSONSchema(outputSchema, { io: "output" }));
  });

  it("rejects malformed calls and unknown tools before router dispatch", async () => {
    const executor = createChatbotApiExecutor(await createApiContext({ headers: new Headers() }));

    await expect(
      executor.execute({
        input: { actorId: "attacker" },
        name: "api.notifications.get-unread-count",
      }),
    ).rejects.toThrow();
    await expect(executor.execute({ input: {}, name: "api.router.anything" })).rejects.toThrow(
      "not available",
    );
  });

  it("rejects malformed and overlong calendar ranges before a caller can be dispatched", async () => {
    let dispatched = false;
    const executor = createChatbotApiExecutor(await createApiContext({ headers: new Headers() }), {
      createCaller: () => ({
        plannedSessions: {
          range: async () => {
            dispatched = true;
            throw new Error("must not execute");
          },
        },
      }),
    });

    await expect(
      executor.execute({
        input: { endDate: "2026-01-01", startDate: "not-a-date" },
        name: "api.planned-sessions.range-own",
      }),
    ).rejects.toMatchObject({ code: "invalid_tool_call" });
    await expect(
      executor.execute({
        input: { endDate: "2026-05-01", startDate: "2026-01-01" },
        name: "api.planned-sessions.range-own",
      }),
    ).rejects.toMatchObject({ code: "invalid_tool_call" });
    expect(dispatched).toBe(false);
  });

  it("uses the trusted actor for the basic profile read and projects no sensitive fields", async () => {
    let requestedId: string | undefined;
    const executor = createChatbotApiExecutor(await actorContext(), {
      createCaller: () => ({
        profiles: {
          getPublicById: async ({ id }) => {
            requestedId = id;
            return {
              id,
              full_name: "Athlete",
              username: "athlete",
              preferred_units: "metric",
              language: "en",
              email: "must-not-project@example.test",
              bio: "must not project",
            } as never;
          },
        },
      }),
    });

    await expect(
      executor.execute({ input: {}, name: "api.profiles.get-own-basic" }),
    ).resolves.toEqual({
      id: actorId,
      fullName: "Athlete",
      username: "athlete",
      preferredUnits: "metric",
      language: "en",
    });
    expect(requestedId).toBe(actorId);
  });

  it("caps scheduled-session output at 500 and marks the result truncated", async () => {
    const items = Array.from({ length: 501 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      planningDate: "2026-01-01",
      activityPlanId: "22222222-2222-4222-8222-222222222222",
      lifecycle: { status: "scheduled" },
    }));
    const executor = createChatbotApiExecutor(await actorContext(), {
      createCaller: () => ({
        plannedSessions: {
          range: async () => ({ items, truncated: false }) as never,
        },
      }),
    });

    await expect(
      executor.execute({
        input: { startDate: "2026-01-01", endDate: "2026-01-01" },
        name: "api.planned-sessions.range-own",
      }),
    ).resolves.toMatchObject({
      truncated: true,
      items: expect.arrayContaining([expect.objectContaining({ id: items[0]?.id })]),
    });
    const result = (await executor.execute({
      input: { startDate: "2026-01-01", endDate: "2026-01-01" },
      name: "api.planned-sessions.range-own",
    })) as { items: unknown[] };
    expect(result.items).toHaveLength(500);
  });

  it("forwards a bounded activity-plan cursor to the existing caller contract", async () => {
    let received: unknown;
    const executor = createChatbotApiExecutor(await actorContext(), {
      createCaller: () => ({
        activityPlans: {
          list: async (input) => {
            received = input;
            return { items: [], nextCursor: null } as never;
          },
          getById: async () => Promise.reject(new Error("not called")),
        },
      }),
    });
    await expect(
      executor.execute({
        input: { limit: 1, cursor: "index:1", direction: "forward" },
        name: "api.activity-plans.list-own",
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(received).toMatchObject({ cursor: "index:1", direction: "forward", limit: 1 });
  });

  it("projects full write-router results and maps strict write inputs without aliases", async () => {
    const operationId = "22222222-2222-4222-8222-222222222222";
    const planId = "33333333-3333-4333-8333-333333333333";
    const sessionId = "44444444-4444-4444-8444-444444444444";
    const activityId = "55555555-5555-4555-8555-555555555555";
    let messageInput: unknown;
    let manualInput: unknown;
    const executor = createChatbotApiExecutor(await actorContext(), {
      createCaller: () =>
        ({
          activityPlans: {
            create: async () =>
              ({
                id: planId,
                revision: 1,
                structure_hash: `v1:sha256:${"a".repeat(64)}`,
                name: "Full row",
              }) as never,
            update: async () =>
              ({
                id: planId,
                revision: 2,
                structure_hash: `v1:sha256:${"b".repeat(64)}`,
                name: "Full row",
              }) as never,
          },
          activities: {
            update: async () =>
              ({ id: activityId, name: "Edited", started_at: new Date() }) as never,
            createManualDiaryEntry: async (input: unknown) => {
              manualInput = input;
              return {
                outcome: "created",
                activity: {
                  id: activityId,
                  name: "Diary",
                  diaryDate: "2026-01-01",
                  activityCategory: "run",
                  diaryTimezone: "UTC",
                  startedAt: null,
                  finishedAt: null,
                  elapsedMs: null,
                  distanceMeters: null,
                  provenance: "manual",
                },
              } as never;
            },
          },
          messaging: {
            sendMessage: async (input: unknown) => {
              messageInput = input;
              return { success: true } as never;
            },
          },
          plannedSessions: {
            create: async () =>
              ({
                outcome: "created",
                session: {
                  id: sessionId,
                  sessionRevision: 1,
                  planningDate: "2026-01-01",
                  profileId: actorId,
                  originalTargetDate: "2026-01-01",
                  source: { kind: "direct", operationId },
                  groupEventId: null,
                  activityPlanId: planId,
                  lifecycle: { status: "scheduled" },
                },
                cache_tags: [],
              }) as never,
            move: async () =>
              ({
                outcome: "updated",
                session: { id: sessionId, sessionRevision: 2, planningDate: "2026-01-02" },
              }) as never,
            cancel: async () =>
              ({
                outcome: "updated",
                session: { id: sessionId, sessionRevision: 3, planningDate: "2026-01-02" },
              }) as never,
          },
        }) as never,
    });
    const activityPlanStructure = {
      version: 5,
      activity_category: "run",
      items: [
        {
          type: "step",
          id: "66666666-6666-4666-8666-666666666666",
          name: "Easy",
          duration: { type: "time", seconds: 60 },
          targets: [],
        },
      ],
    };

    await expect(
      executor.execute({
        name: "api.activity-plans.create",
        input: { name: "Plan", structure: activityPlanStructure, operationId: "a".repeat(32) },
      }),
    ).resolves.toEqual({ id: planId, revision: 1, structure_hash: `v1:sha256:${"a".repeat(64)}` });
    await expect(
      executor.execute({
        name: "api.activity-plans.update",
        input: {
          id: planId,
          expectedRevision: 1,
          expectedStructureHash: `v1:sha256:${"a".repeat(64)}`,
          name: "Edited",
          operationId: "b".repeat(32),
        },
      }),
    ).resolves.toEqual({ id: planId, revision: 2, structure_hash: `v1:sha256:${"b".repeat(64)}` });
    await expect(
      executor.execute({
        name: "api.planned-sessions.create",
        input: { operationId, session: { planningDate: "2026-01-01", activityPlanId: planId } },
      }),
    ).resolves.toEqual({
      outcome: "created",
      session: { id: sessionId, sessionRevision: 1, planningDate: "2026-01-01" },
    });
    await expect(
      executor.execute({
        name: "api.activities.update",
        input: { id: activityId, name: "Edited", operationId: "c".repeat(32) },
      }),
    ).resolves.toEqual({ id: activityId, name: "Edited" });
    await expect(
      executor.execute({
        name: "api.activities.create-manual-diary-entry",
        input: {
          observation: {
            operationId,
            diaryDate: "2026-01-01",
            diaryTimezone: "UTC",
            name: "Diary",
            activityCategory: "run",
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "created",
      activity: { id: activityId, name: "Diary", diaryDate: "2026-01-01" },
    });
    await expect(
      executor.execute({
        name: "api.messaging.send-message",
        input: { conversation_id: sessionId, content: "Hello", operationId: "d".repeat(32) },
      }),
    ).resolves.toEqual({ success: true });
    expect(messageInput).toEqual({
      conversation_id: sessionId,
      content: "Hello",
      operation_id: "d".repeat(32),
    });
    expect(manualInput).toEqual({
      observation: {
        operationId,
        diaryDate: "2026-01-01",
        diaryTimezone: "UTC",
        name: "Diary",
        activityCategory: "run",
      },
    });
  });

  it("requires UUID operation IDs before dispatch for planned sessions and manual diaries", async () => {
    let dispatched = false;
    const executor = createChatbotApiExecutor(await actorContext(), {
      createCaller: () =>
        ({
          plannedSessions: {
            create: async () => {
              dispatched = true;
              throw new Error("must not dispatch");
            },
            move: async () => {
              dispatched = true;
              throw new Error("must not dispatch");
            },
            cancel: async () => {
              dispatched = true;
              throw new Error("must not dispatch");
            },
          },
          activities: {
            createManualDiaryEntry: async () => {
              dispatched = true;
              throw new Error("must not dispatch");
            },
          },
        }) as never,
    });
    const planId = "33333333-3333-4333-8333-333333333333";
    const sessionId = "44444444-4444-4444-8444-444444444444";
    for (const call of [
      {
        name: "api.planned-sessions.create",
        input: {
          operationId: "a".repeat(32),
          session: { planningDate: "2026-01-01", activityPlanId: planId },
        },
      },
      {
        name: "api.planned-sessions.move",
        input: {
          operationId: "a".repeat(32),
          sessionId,
          expectedRevision: 1,
          planningDate: "2026-01-02",
        },
      },
      {
        name: "api.planned-sessions.cancel",
        input: { operationId: "a".repeat(32), sessionId, expectedRevision: 1 },
      },
      {
        name: "api.activities.create-manual-diary-entry",
        input: {
          observation: {
            operationId: "a".repeat(32),
            diaryDate: "2026-01-01",
            diaryTimezone: "UTC",
            name: "Diary",
            activityCategory: "run",
          },
        },
      },
    ])
      await expect(executor.execute(call)).rejects.toMatchObject({ code: "invalid_tool_call" });
    expect(dispatched).toBe(false);
  });

  it("sanitizes implementation and invalid-output failures", async () => {
    const context = await createApiContext({ headers: new Headers() });
    const internalFailure = createChatbotApiExecutor(context, {
      createCaller: () => ({
        notifications: { getUnreadCount: async () => Promise.reject(new Error("database secret")) },
      }),
    });
    const invalidOutput = createChatbotApiExecutor(context, {
      createCaller: () => ({
        notifications: { getUnreadCount: async () => JSON.parse('"database row"') },
      }),
    });

    await expect(
      internalFailure.execute({ input: {}, name: "api.notifications.get-unread-count" }),
    ).rejects.toMatchObject({
      code: "internal_error",
      message: "The chatbot tool could not be completed.",
    });
    await expect(
      invalidOutput.execute({ input: {}, name: "api.notifications.get-unread-count" }),
    ).rejects.toMatchObject({ code: "invalid_tool_output" });

    try {
      await internalFailure.execute({ input: {}, name: "api.notifications.get-unread-count" });
    } catch (error) {
      expect(error).toBeInstanceOf(ChatbotToolError);
      expect(String(error)).not.toContain("database secret");
    }
  });
});
