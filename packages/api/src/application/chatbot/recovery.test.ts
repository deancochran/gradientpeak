import { describe, expect, it } from "vitest";
import type { ApiContext } from "../../context";
import type {
  ChatbotHistoryRepository,
  ChatbotRecoveryTurn,
} from "../../repositories/chatbot-history-repository";
import { createChatbotRecoveryService } from "./recovery";

const actorId = "11111111-1111-4111-8111-111111111111";
const turn: ChatbotRecoveryTurn = {
  id: "22222222-2222-4222-8222-222222222222",
  threadId: "33333333-3333-4333-8333-333333333333",
  requestFingerprint: "x",
  status: "interrupted",
  input: { role: "user", text: "send" },
  output: null,
  leaseExpiresAt: null,
  actions: [
    {
      id: "row",
      actionId: "44444444-4444-4444-8444-444444444444",
      toolCallId: "call",
      toolId: "api.messaging.send-message",
      input: { content: "hello" },
      status: "unknown",
      result: null,
    },
  ],
};
const context = { session: { user: { id: actorId } } } as ApiContext;

function repository(): ChatbotHistoryRepository {
  let current = structuredClone(turn);
  return {
    claim: async () => ({ kind: "active" }),
    finish: async () => false,
    history: async () => null,
    historyForTurn: async () => null,
    isActive: async () => false,
    interruptExpired: async () => 0,
    persistAction: async () => "inactive",
    finishAction: async () => false,
    status: async () => [current],
    loadRecovery: async () => current,
    reconcileAction: async ({ actionId, result }) => {
      current = {
        ...current,
        actions: current.actions.map((action) =>
          action.actionId === actionId ? { ...action, status: "completed", result } : action,
        ),
      };
      return true;
    },
    completeRecovery: async ({ output }) => {
      current = { ...current, status: "completed", output };
      return true;
    },
  };
}

describe("chatbot recovery", () => {
  it("reexecutes the recorded receipt with its existing action ID and never calls a model", async () => {
    const execute = async (call: unknown) => {
      expect(call).toEqual({
        name: "api.messaging.send-message",
        input: { content: "hello", operationId: turn.actions[0]?.actionId },
      });
      return { success: true };
    };
    const service = createChatbotRecoveryService({
      repository: repository(),
      createApiExecutor: () => ({
        execute,
        listTools: () => [
          {
            id: "api.messaging.send-message",
            description: "send",
            operation: "write",
            retrySafety: "retry_safe",
            scope: "api",
            userAuthority: "user",
            routerOperation: "messaging.sendMessage",
            operationIdPath: ["operationId"],
            inputSchema: {},
            outputSchema: {},
          },
        ],
      }),
    });
    await expect(
      service.recover(context, { threadId: turn.threadId, turnId: turn.id }),
    ).resolves.toMatchObject({
      kind: "completed",
      actions: [{ actionId: turn.actions[0]?.actionId, status: "completed" }],
    });
  });
  it("fails closed when a receipt has been altered", async () => {
    const altered = repository();
    const action = turn.actions[0];
    if (!action) throw new Error("fixture action missing");
    altered.loadRecovery = async () => ({
      ...turn,
      actions: [{ ...action, input: { content: "changed" } }],
    });
    const service = createChatbotRecoveryService({
      repository: altered,
      createApiExecutor: () => ({
        execute: async () => {
          throw new Error("must not execute");
        },
        listTools: () => [],
      }),
    });
    await expect(
      service.recover(context, { threadId: turn.threadId, turnId: turn.id }),
    ).resolves.toMatchObject({ kind: "unresolved" });
  });
});
