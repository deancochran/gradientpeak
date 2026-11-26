import {
  type ApiChatbotToolDescriptor,
  type ChatbotApiExecutor,
  createChatbotApiExecutor,
} from "../../chatbot";
import type { ApiContext } from "../../context";
import type { ChatbotHistoryMessage } from "../../contracts/chatbot";
import {
  type ChatbotActionRecord,
  type ChatbotHistoryRepository,
  type ChatbotRecoveryTurn,
  createDrizzleChatbotHistoryRepository,
} from "../../repositories/chatbot-history-repository";

const MAX_ACTIONS = 20;
const MAX_RESULT_CHARS = 800;

export type ChatbotRecoveryOutcome =
  | {
      kind: "completed";
      threadId: string;
      turnId: string;
      text: string;
      actions: readonly RecoveryActionDto[];
    }
  | { kind: "unresolved"; threadId: string; turnId: string; actions: readonly RecoveryActionDto[] }
  | { kind: "error"; status: 401 | 404 | 409 | 503; code: string };
export type RecoveryActionDto = {
  actionId: string;
  toolId: string;
  status: "completed" | "failed" | "pending" | "unknown";
  result?: unknown;
};

export type CreateChatbotRecoveryServiceOptions = {
  repository?: ChatbotHistoryRepository;
  createApiExecutor?: (context: ApiContext) => ChatbotApiExecutor;
  now?: () => Date;
};

/** Replays durable action receipts only. This service never selects or calls a language model. */
export function createChatbotRecoveryService(options: CreateChatbotRecoveryServiceOptions = {}) {
  const now = options.now ?? (() => new Date());
  return {
    async status(context: ApiContext, threadId: string) {
      const actorId = context.session?.user.id;
      if (!actorId) return { kind: "error" as const, status: 401 as const, code: "unauthorized" };
      const repository =
        options.repository ??
        (context.db ? createDrizzleChatbotHistoryRepository(context.db) : undefined);
      if (!repository)
        return { kind: "error" as const, status: 503 as const, code: "chatbot_unavailable" };
      try {
        const turns = await repository.status({ actorId, threadId });
        if (!turns) return { kind: "error" as const, status: 404 as const, code: "not_found" };
        return { kind: "status" as const, threadId, turns: turns.map(toTurnDto) };
      } catch {
        return { kind: "error" as const, status: 503 as const, code: "chatbot_unavailable" };
      }
    },
    async recover(
      context: ApiContext,
      input: { threadId: string; turnId: string },
    ): Promise<ChatbotRecoveryOutcome> {
      const actorId = context.session?.user.id;
      if (!actorId) return { kind: "error", status: 401, code: "unauthorized" };
      const repository =
        options.repository ??
        (context.db ? createDrizzleChatbotHistoryRepository(context.db) : undefined);
      if (!repository) return { kind: "error", status: 503, code: "chatbot_unavailable" };
      let turn: ChatbotRecoveryTurn;
      try {
        const loaded = await repository.loadRecovery({ actorId, ...input, now: now() });
        if (loaded === "denied" || loaded === "missing")
          return { kind: "error", status: 404, code: "not_found" };
        if (loaded === "running") return { kind: "error", status: 409, code: "turn_running" };
        turn = loaded;
      } catch {
        return { kind: "error", status: 503, code: "chatbot_unavailable" };
      }
      if (turn.actions.length > MAX_ACTIONS)
        return { kind: "error", status: 409, code: "recovery_too_large" };
      const executor = options.createApiExecutor?.(context) ?? createChatbotApiExecutor(context);
      const descriptors = new Map(
        executor.listTools().map((descriptor) => [descriptor.id, descriptor]),
      );
      for (const action of turn.actions) {
        const descriptor = descriptors.get(action.toolId);
        if (!descriptor) return unresolved(turn);
        try {
          // Reauthorize every receipt, including completed ones. A completed receipt
          // alone must not disclose data after access is revoked.
          const result = await executor.execute({
            name: action.toolId,
            input: withActionId(action, descriptor),
          });
          if (
            action.status !== "completed" &&
            !(await repository.reconcileAction({
              actorId,
              turnId: turn.id,
              actionId: action.actionId,
              result,
              now: now(),
            }))
          ) {
            // Another recovery may have reconciled and finalized while this
            // caller was replaying the same receipt.  Report its durable
            // terminal outcome rather than the stale unknown snapshot.
            const latest = await repository.status({ actorId, threadId: turn.threadId });
            const current = latest?.find((candidate) => candidate.id === turn.id);
            if (current?.status === "completed" && current.output) return completedOutcome(current);
            if (current?.actions.every((candidate) => candidate.status === "completed")) {
              turn = current;
              continue;
            }
            return unresolved(current ?? turn);
          }
        } catch {
          return unresolved(turn);
        }
      }
      const refreshed = await repository.status({ actorId, threadId: turn.threadId });
      const recovered = refreshed?.find((candidate) => candidate.id === turn.id) ?? turn;
      if (recovered.actions.some((action) => action.status !== "completed"))
        return unresolved(recovered);
      if (recovered.status === "completed" && recovered.output) return completedOutcome(recovered);
      const output = recoveryOutput(recovered.actions);
      if (!(await repository.completeRecovery({ actorId, turnId: turn.id, output, now: now() }))) {
        const latest = await repository.status({ actorId, threadId: turn.threadId });
        const completed = latest?.find((candidate) => candidate.id === turn.id);
        if (completed?.status === "completed" && completed.output)
          return completedOutcome(completed);
        return unresolved(completed ?? recovered);
      }
      return completedOutcome({ ...recovered, status: "completed", output });
    },
  };
}

function withActionId(
  action: ChatbotActionRecord,
  descriptor: ApiChatbotToolDescriptor,
): Record<string, unknown> {
  const input = structuredClone(action.input);
  if (descriptor.operation !== "write") return input;
  const path = descriptor.operationIdPath;
  if (!path) throw new Error("Missing operation ID path");
  let target: Record<string, unknown> = input;
  for (const key of path.slice(0, -1)) {
    const value = target[key];
    if (!isRecord(value)) throw new Error("Invalid stored action input");
    target = value;
  }
  const last = path.at(-1);
  if (!last || Object.hasOwn(target, last)) throw new Error("Invalid stored action input");
  target[last] = action.actionId;
  return input;
}

function recoveryOutput(actions: readonly ChatbotActionRecord[]): ChatbotHistoryMessage {
  const names = actions.map((action) => `${action.toolId} (${action.actionId})`).join(", ");
  return {
    role: "assistant",
    text: `Recovered ${actions.length} recorded action${actions.length === 1 ? "" : "s"}: ${names}. No new response was generated.`.slice(
      0,
      16_000,
    ),
  };
}
function unresolved(turn: ChatbotRecoveryTurn): ChatbotRecoveryOutcome {
  return {
    kind: "unresolved",
    threadId: turn.threadId,
    turnId: turn.id,
    actions: turn.actions.map(toActionDto),
  };
}
function completedOutcome(turn: ChatbotRecoveryTurn): ChatbotRecoveryOutcome {
  if (!turn.output) return unresolved(turn);
  return {
    kind: "completed",
    threadId: turn.threadId,
    turnId: turn.id,
    text: turn.output.text,
    actions: turn.actions.map(toActionDto),
  };
}
function toTurnDto(turn: ChatbotRecoveryTurn) {
  return {
    id: turn.id,
    status: turn.status,
    input: turn.input,
    output: turn.output,
    actions: turn.actions.map(toActionDto),
  };
}
function toActionDto(action: ChatbotActionRecord): RecoveryActionDto {
  return {
    actionId: action.actionId,
    toolId: action.toolId,
    status: action.status,
    ...(action.status === "completed" && action.result !== undefined
      ? { result: boundedResult(action.result) }
      : {}),
  };
}
function boundedResult(value: unknown): unknown {
  const text = JSON.stringify(value);
  return text && text.length <= MAX_RESULT_CHARS
    ? value
    : { summary: "Recorded result is available." };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
