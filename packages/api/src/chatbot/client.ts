import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import { z } from "zod";

import {
  chatbotRecoveryRequestSchema,
  chatbotRequestSchema,
  chatbotStatusRequestSchema,
} from "../contracts/chatbot";

const idSchema = z.string().uuid();
const textSchema = z.string().max(16_000);
const actionSchema = z
  .object({
    actionId: idSchema,
    toolId: z.string().min(1).max(128),
    status: z.enum(["completed", "failed", "pending", "unknown"]),
    result: z.unknown().optional(),
  })
  .strict();
const turnSchema = z
  .object({
    id: idSchema,
    status: z.enum(["completed", "failed", "interrupted", "running"]),
    input: z.object({ role: z.literal("user"), text: textSchema }).strict(),
    output: z
      .object({ role: z.literal("assistant"), text: textSchema })
      .strict()
      .nullable()
      .optional(),
    actions: z.array(actionSchema).max(20),
  })
  .strict();
const statusSchema = z
  .object({ kind: z.literal("status"), threadId: idSchema, turns: z.array(turnSchema).max(20) })
  .strict();
const completedSchema = z
  .object({
    status: z.literal("completed"),
    text: textSchema,
    threadId: idSchema,
    turnId: idSchema,
  })
  .strict();
const recoveryCompletedSchema = z
  .object({
    kind: z.literal("completed"),
    threadId: idSchema,
    turnId: idSchema,
    text: textSchema,
    actions: z.array(actionSchema).max(20),
  })
  .strict();
const recoveryUnresolvedSchema = z
  .object({
    kind: z.literal("unresolved"),
    threadId: idSchema,
    turnId: idSchema,
    actions: z.array(actionSchema).max(20),
  })
  .strict();
const errorSchema = z.object({ error: z.string().max(128) }).strict();
// A replay can reach the host after its initial acknowledgement was lost.  The
// host deliberately returns this small recovery envelope instead of an error.
const replayRecoverySchema = z
  .object({
    status: z.enum(["running", "interrupted", "failed"]),
    threadId: idSchema,
    turnId: idSchema,
  })
  .strict();

export type ChatbotClientStatus =
  | "idle"
  | "streaming"
  | "completed"
  | "interrupted"
  | "unknown"
  | "error";
export type ChatbotClientErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "update_client"
  | "unavailable"
  | "conflict"
  | "invalid_response"
  | "network"
  | "persistence";
export type ChatbotActivity = {
  readonly id: string;
  readonly label: string;
  readonly status: "completed" | "failed" | "pending" | "unknown";
};
export type ChatbotMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
};
export type ChatbotPending = {
  readonly requestId: string;
  readonly text: string;
  readonly threadId?: string | undefined;
  readonly turnId?: string | undefined;
};
export type ChatbotClientSnapshot = {
  readonly threadId?: string | undefined;
  readonly pending?: ChatbotPending | undefined;
};
export type ChatbotClientState = {
  readonly status: ChatbotClientStatus;
  readonly messages: readonly ChatbotMessage[];
  readonly activities: readonly ChatbotActivity[];
  readonly threadId?: string | undefined;
  readonly pending?: ChatbotPending | undefined;
  readonly error?:
    | { readonly code: ChatbotClientErrorCode; readonly retryAfterSeconds?: number | undefined }
    | undefined;
  readonly canSend: boolean;
  readonly canRecover: boolean;
  readonly canRetryPending: boolean;
};
export type ChatbotClientPersistence = {
  load?(): Promise<unknown> | unknown;
  save(snapshot: ChatbotClientSnapshot): Promise<void> | void;
  clear?(): Promise<void> | void;
};
export type CreateChatbotClientOptions = {
  readonly endpoint: string;
  readonly fetch: typeof globalThis.fetch;
  readonly createRequestId: () => string;
  readonly persistence?: ChatbotClientPersistence;
  readonly headers?: HeadersInit | (() => HeadersInit);
  readonly initialSnapshot?: unknown;
};

/** Framework-independent, client-safe HTTP transport. Apps own hooks, rendering, auth headers, and draft storage. */
export function createChatbotClient(options: CreateChatbotClientOptions) {
  let state = makeState(decodeSnapshot(options.initialSnapshot));
  let generation = 0;
  let active: AbortController | undefined;
  let disposed = false;
  const listeners = new Set<() => void>();
  const requestByTurn = new Map<string, string>();
  const emit = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };
  const set = (next: Omit<ChatbotClientState, "canSend" | "canRecover" | "canRetryPending">) => {
    state = withCapabilities(next);
    emit();
  };
  const persist = async (snapshot: ChatbotClientSnapshot) => {
    if (!options.persistence) return;
    await options.persistence.save(snapshot);
  };
  const clear = async () => options.persistence?.clear?.();
  const guard = (token: number) => !disposed && token === generation;

  async function send(text: string, onAccepted?: () => void): Promise<void> {
    if (!state.canSend || active || disposed) return;
    const parsed = chatbotRequestSchema.safeParse({
      requestId: options.createRequestId(),
      text,
      threadId: state.threadId,
    });
    if (!parsed.success) {
      set({ ...state, status: "error", error: { code: "invalid_response" } });
      return;
    }
    const pending: ChatbotPending = parsed.data;
    await begin(pending, onAccepted);
  }
  async function retryPending(): Promise<void> {
    if (state.canRetryPending && state.pending) await begin(state.pending);
  }
  async function begin(pending: ChatbotPending, onAccepted?: () => void): Promise<void> {
    if (active || disposed) return;
    const token = ++generation;
    // Reserve the transport before persistence. Otherwise two callers that both
    // enter while save() is pending can each start a separate mutation.
    const controller = new AbortController();
    active = controller;
    try {
      await persist({ threadId: pending.threadId, pending });
    } catch {
      if (guard(token)) set({ ...state, status: "error", error: { code: "persistence" } });
      if (active === controller) active = undefined;
      return;
    }
    if (!guard(token)) {
      if (active === controller) active = undefined;
      return;
    }
    set({
      ...state,
      status: "streaming",
      pending,
      error: undefined,
      messages: mergeMessages(state.messages, [
        { id: `user:${pending.requestId}`, role: "user", text: pending.text },
      ]),
    });
    // Acceptance means the recovery record and user message now exist locally;
    // it does not claim that the server turn has completed.
    onAccepted?.();
    try {
      const response = await options.fetch(options.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: jsonHeaders(options.headers),
        body: JSON.stringify({
          requestId: pending.requestId,
          text: pending.text,
          threadId: pending.threadId,
        }),
      });
      if (!guard(token)) return;
      await consumeResponse(response, pending, token);
    } catch (cause) {
      if (!guard(token)) return;
      set({
        ...state,
        status: isAbort(cause) ? "interrupted" : "unknown",
        error: isAbort(cause) ? undefined : { code: "network" },
      });
    } finally {
      if (active === controller) active = undefined;
    }
  }
  async function consumeResponse(response: Response, pending: ChatbotPending, token: number) {
    if (response.status !== 200) {
      if (response.status === 409) {
        const body = await boundedJson(response);
        const replay = replayRecoverySchema.safeParse(body);
        if (
          replay.success &&
          state.pending?.requestId === pending.requestId &&
          (!state.pending.threadId || state.pending.threadId === replay.data.threadId) &&
          (!state.pending.turnId || state.pending.turnId === replay.data.turnId)
        ) {
          const discovered = {
            ...state.pending,
            threadId: replay.data.threadId,
            turnId: replay.data.turnId,
          };
          try {
            await persist({ threadId: replay.data.threadId, pending: discovered });
          } catch {
            return invalid(token, "persistence");
          }
          if (!guard(token) || state.pending?.requestId !== pending.requestId) return;
          requestByTurn.set(replay.data.turnId, pending.requestId);
          set({
            ...state,
            threadId: replay.data.threadId,
            pending: discovered,
            status: replay.data.status === "interrupted" ? "interrupted" : "unknown",
            error: { code: "conflict" },
          });
          return;
        }
        // The response body was consumed while validating the only recovery
        // envelope that is safe to trust; preserve generic conflict behavior.
        return setHttpError(response, token, body);
      }
      await setHttpError(response, token);
      return;
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
      const body = await boundedJson(response);
      const complete = completedSchema.safeParse(body);
      if (!complete.success) return invalid(token);
      return finalize(complete.data.threadId, complete.data.turnId, complete.data.text, token);
    }
    const threadId = idSchema.safeParse(response.headers.get("x-chatbot-thread-id"));
    const turnId = idSchema.safeParse(response.headers.get("x-chatbot-turn-id"));
    const requestId = idSchema.safeParse(response.headers.get("x-chatbot-request-id"));
    if (
      !threadId.success ||
      !turnId.success ||
      !requestId.success ||
      requestId.data !== pending.requestId ||
      !response.body
    )
      return invalid(token);
    const identified = { ...pending, threadId: threadId.data, turnId: turnId.data };
    try {
      await persist({ threadId: threadId.data, pending: identified });
    } catch {
      return invalid(token, "persistence");
    }
    if (!guard(token)) return;
    requestByTurn.set(turnId.data, pending.requestId);
    set({ ...state, threadId: threadId.data, pending: identified });
    let finished = false;
    let text = "";
    const stream = parseJsonEventStream({ stream: response.body, schema: uiMessageChunkSchema });
    for await (const parsed of stream as AsyncIterable<{
      success: boolean;
      value?: { type: string; delta?: string };
    }>) {
      if (!guard(token)) return;
      if (!parsed.success || !parsed.value) return invalid(token);
      if (parsed.value.type === "text-delta") {
        text = `${text}${parsed.value.delta ?? ""}`;
        if (text.length > 16_000) return invalid(token);
        set({
          ...state,
          messages: mergeMessages(state.messages, [
            { id: `assistant:${turnId.data}`, role: "assistant", text },
          ]),
        });
      }
      if (parsed.value.type === "error" || parsed.value.type === "abort") return invalid(token);
      if (parsed.value.type === "finish") finished = true;
    }
    if (!finished) return invalid(token);
    // A stream finish is meaningful only because the host emits it after durable completion.
    await finalize(threadId.data, turnId.data, text, token);
  }
  async function finalize(threadId: string, turnId: string, text: string, token: number) {
    if (!guard(token)) return;
    if (state.pending) requestByTurn.set(turnId, state.pending.requestId);
    try {
      await persist({ threadId });
    } catch {
      return invalid(token, "persistence");
    }
    if (guard(token))
      set({
        ...state,
        status: "completed",
        threadId,
        pending: undefined,
        error: undefined,
        messages: mergeMessages(state.messages, [
          { id: `assistant:${turnId}`, role: "assistant", text },
        ]),
      });
  }
  async function refresh(): Promise<void> {
    if (!state.threadId || active || disposed) return;
    const token = ++generation;
    const controller = new AbortController();
    active = controller;
    try {
      const response = await options.fetch(
        `${options.endpoint}?threadId=${encodeURIComponent(chatbotStatusRequestSchema.parse({ threadId: state.threadId }).threadId)}`,
        { signal: controller.signal, headers: resolveHeaders(options.headers) },
      );
      if (!guard(token)) return;
      if (response.status !== 200) return setHttpError(response, token);
      const parsed = statusSchema.safeParse(await boundedJson(response));
      if (!parsed.success) return invalid(token);
      const messages = parsed.data.turns.flatMap((turn) => [
        {
          id: `user:${requestByTurn.get(turn.id) ?? turn.id}`,
          role: "user" as const,
          text: turn.input.text,
        },
        ...(turn.output
          ? [{ id: `assistant:${turn.id}`, role: "assistant" as const, text: turn.output.text }]
          : []),
      ]);
      const pendingTurn = parsed.data.turns.find((turn) => turn.id === state.pending?.turnId);
      const completedPending = pendingTurn?.status === "completed";
      if (completedPending) {
        try {
          await persist({ threadId: parsed.data.threadId });
        } catch {
          return invalid(token, "persistence");
        }
        if (!guard(token)) return;
      }
      set({
        ...state,
        ...(completedPending ? { status: "completed", error: undefined } : {}),
        ...(pendingTurn?.status === "interrupted"
          ? { status: "interrupted", error: undefined }
          : {}),
        ...(pendingTurn?.status === "running" ? { status: "unknown" } : {}),
        messages: mergeMessages(state.messages, messages),
        activities: parsed.data.turns.flatMap((turn) => turn.actions.map(activity)),
        threadId: parsed.data.threadId,
        pending: completedPending ? undefined : state.pending,
      });
    } catch (cause) {
      if (guard(token) && !isAbort(cause))
        set({ ...state, status: "unknown", error: { code: "network" } });
    } finally {
      if (active === controller) active = undefined;
    }
  }
  async function recover(): Promise<void> {
    if (active || !state.canRecover || !state.pending?.threadId || !state.pending.turnId) return;
    const token = ++generation;
    const controller = new AbortController();
    active = controller;
    try {
      const input = chatbotRecoveryRequestSchema.parse({
        type: "recover",
        threadId: state.pending.threadId,
        turnId: state.pending.turnId,
      });
      const response = await options.fetch(options.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: jsonHeaders(options.headers),
        body: JSON.stringify(input),
      });
      if (!guard(token)) return;
      const body = await boundedJson(response);
      const completed = recoveryCompletedSchema.safeParse(body);
      if (response.status === 200 && completed.success)
        return finalize(completed.data.threadId, completed.data.turnId, completed.data.text, token);
      const unresolved = recoveryUnresolvedSchema.safeParse(body);
      if (response.status === 409 && unresolved.success) {
        set({
          ...state,
          status: "unknown",
          activities: unresolved.data.actions.map(activity),
          pending: {
            ...state.pending,
            threadId: unresolved.data.threadId,
            turnId: unresolved.data.turnId,
          },
          error: { code: "conflict" },
        });
        return;
      }
      await setHttpError(response, token);
    } catch (cause) {
      if (guard(token) && !isAbort(cause))
        set({ ...state, status: "unknown", error: { code: "network" } });
    } finally {
      if (active === controller) active = undefined;
    }
  }
  function stop() {
    const controller = active;
    if (!controller) return;
    // Invalidate the reader before aborting: not every fetch implementation
    // immediately rejects a body reader after its signal is aborted.
    generation++;
    active = undefined;
    controller.abort();
    if (!disposed) set({ ...state, status: "interrupted", error: undefined });
  }
  async function newConversation(): Promise<void> {
    if (state.pending || active) return;
    generation++;
    await clear();
    requestByTurn.clear();
    set(makeState({}));
  }
  function restore(snapshot: unknown): void {
    if (disposed || active || state.messages.length > 0 || state.pending || state.threadId) return;
    const restored = decodeSnapshot(snapshot);
    if (restored.pending || restored.threadId) set(makeState(restored));
  }
  function dispose() {
    disposed = true;
    generation++;
    active?.abort();
    active = undefined;
    listeners.clear();
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
    retryPending,
    refresh,
    recover,
    stop,
    newConversation,
    restore,
    dispose,
  };
  async function setHttpError(response: Response, token: number, responseBody?: unknown) {
    const retry = Number(response.headers.get("retry-after"));
    const body = errorSchema.safeParse(responseBody ?? (await boundedJson(response)));
    if (!guard(token)) return;
    if (response.status === 401) {
      await clear();
      if (!guard(token)) return;
      set(makeState({}, { status: "error", error: { code: "unauthorized" } }));
      return;
    }
    const code: ChatbotClientErrorCode =
      response.status === 429
        ? "rate_limited"
        : response.status === 412
          ? "update_client"
          : response.status === 409
            ? "conflict"
            : "unavailable";
    set({
      ...state,
      status: response.status === 409 ? "unknown" : "error",
      error: { code, ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}) },
    });
    void body;
  }
  function invalid(token: number, code: ChatbotClientErrorCode = "invalid_response") {
    if (guard(token)) set({ ...state, status: "unknown", error: { code } });
  }
}

function makeState(
  snapshot: ChatbotClientSnapshot,
  patch: Partial<ChatbotClientState> = {},
): ChatbotClientState {
  return withCapabilities({
    status: snapshot.pending?.threadId && snapshot.pending.turnId ? "interrupted" : "idle",
    messages: [],
    activities: [],
    ...snapshot,
    ...patch,
  });
}
function withCapabilities(
  state: Omit<ChatbotClientState, "canSend" | "canRecover" | "canRetryPending">,
): ChatbotClientState {
  const unresolved = Boolean(state.pending);
  return {
    ...state,
    canSend: !unresolved && state.status !== "streaming",
    canRecover:
      Boolean(state.pending?.threadId && state.pending.turnId) && state.status === "interrupted",
    canRetryPending: Boolean(state.pending) && state.status !== "streaming",
  };
}
function decodeSnapshot(value: unknown): ChatbotClientSnapshot {
  const parsed = z
    .object({
      threadId: idSchema.optional(),
      pending: z
        .object({
          requestId: idSchema,
          text: chatbotRequestSchema.shape.text,
          threadId: idSchema.optional(),
          turnId: idSchema.optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .safeParse(value);
  return parsed.success ? parsed.data : {};
}
function mergeMessages(existing: readonly ChatbotMessage[], incoming: readonly ChatbotMessage[]) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()];
}
function activity(value: z.output<typeof actionSchema>): ChatbotActivity {
  return { id: value.actionId, label: friendlyToolName(value.toolId), status: value.status };
}
function friendlyToolName(toolId: string) {
  const names: Record<string, string> = {
    "api.activity-plans.create": "Creating activity plan",
    "api.planned-sessions.create": "Scheduling session",
    "api.activities.create-manual-diary-entry": "Saving diary entry",
  };
  return names[toolId] ?? "Completing an activity";
}
function resolveHeaders(headers: CreateChatbotClientOptions["headers"]): HeadersInit {
  return typeof headers === "function" ? headers() : (headers ?? {});
}
function jsonHeaders(headers: CreateChatbotClientOptions["headers"]): Headers {
  const resolved = new Headers(resolveHeaders(headers));
  resolved.set("content-type", "application/json");
  return resolved;
}
async function boundedJson(response: Response): Promise<unknown> {
  // Status contains up to twenty 4k-input/16k-output turns plus bounded action
  // summaries. Allow JSON escaping overhead, but bound bytes before buffering.
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4_000_000) {
        await reader.cancel();
        return undefined;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
function isAbort(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}
