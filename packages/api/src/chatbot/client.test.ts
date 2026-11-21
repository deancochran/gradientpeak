import { describe, expect, it, vi } from "vitest";

import { createChatbotClient } from "./client";

const requestId = "11111111-1111-4111-8111-111111111111";
const otherRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const threadId = "22222222-2222-4222-8222-222222222222";
const turnId = "33333333-3333-4333-8333-333333333333";
const encoder = new TextEncoder();

function sseResponse(
  chunks: readonly unknown[],
  options: { readonly requestId?: string; readonly bytes?: readonly Uint8Array[] } = {},
) {
  const body = options.bytes ?? encodeEvents(chunks);
  return new Response(bytesStream(body), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "x-chatbot-request-id": options.requestId ?? requestId,
      "x-chatbot-thread-id": threadId,
      "x-chatbot-turn-id": turnId,
    },
  });
}

function events(text: string, terminal: unknown = { type: "finish", finishReason: "stop" }) {
  return [
    { type: "start", messageId: `assistant:${turnId}` },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    terminal,
    "[DONE]",
  ];
}

function encodeEvents(chunks: readonly unknown[]) {
  return encoder.encode(
    chunks
      .map((chunk) =>
        chunk === "[DONE]" ? "data: [DONE]\r\n\r\n" : `data: ${JSON.stringify(chunk)}\r\n\r\n`,
      )
      .join(""),
  );
}

function bytesStream(bytes: Uint8Array | readonly Uint8Array[]) {
  const pieces = bytes instanceof Uint8Array ? [bytes] : bytes;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(piece);
      controller.close();
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockCalls(fetch: { readonly mock: { readonly calls: unknown } }) {
  return fetch.mock.calls as readonly (readonly unknown[])[];
}

function status(turnStatus: "running" | "completed", output: string | null) {
  return {
    kind: "status",
    threadId,
    turns: [
      {
        id: turnId,
        status: turnStatus,
        input: { role: "user", text: "Hello" },
        output: output === null ? null : { role: "assistant", text: output },
        actions: [],
      },
    ],
  };
}

describe("chatbot client transport", () => {
  it("does not duplicate a submitted user message when completed history is refreshed", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(events("Done")))
      .mockResolvedValueOnce(Response.json(status("completed", "Done")));
    const client = createChatbotClient({
      endpoint: "/api/chat",
      fetch,
      createRequestId: () => requestId,
    });
    await client.send("Hello");
    await client.refresh();
    expect(client.getState().messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });
  it.each([
    new Headers({ "x-gradientpeak-contract-epoch": "test" }),
    [["x-gradientpeak-contract-epoch", "test"]] as [string, string][],
  ])("preserves HeadersInit on send and recovery and omits local turn IDs on retry", async (headers) => {
    const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("x-gradientpeak-contract-epoch")).toBe("test");
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      const body = JSON.parse(String(init?.body));
      if (body.type === "recover")
        return Response.json({
          kind: "completed",
          threadId,
          turnId,
          text: "Recovered",
          actions: [
            {
              actionId: otherRequestId,
              toolId: "api.test",
              status: "completed",
              result: { private: "not rendered" },
            },
          ],
        });
      expect(body).toEqual({ requestId, text: "Hello", threadId });
      return Response.json({ status: "interrupted", threadId, turnId }, { status: 409 });
    });
    const client = createChatbotClient({
      endpoint: "/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      headers: () => headers,
      createRequestId: () => requestId,
      initialSnapshot: { threadId, pending: { requestId, text: "Hello", threadId, turnId } },
    });
    await client.retryPending();
    expect(client.getState().canRecover).toBe(true);
    await client.recover();
    expect(client.getState()).toMatchObject({ status: "completed", pending: undefined });
    expect(JSON.stringify(client.getState())).not.toContain("not rendered");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("adopts interrupted status and accepts completed action results without exposing them", async () => {
    const payload = status("running", null);
    let serverStatus = "running";
    const client = createChatbotClient({
      endpoint: "/api/chat",
      createRequestId: () => requestId,
      initialSnapshot: { threadId, pending: { requestId, text: "Hello", threadId, turnId } },
      fetch: vi.fn(async () =>
        Response.json({
          ...payload,
          turns: payload.turns.map((turn) => ({
            ...turn,
            status: serverStatus,
            actions: [
              {
                actionId: otherRequestId,
                toolId: "api.test",
                status: "completed",
                result: { private: "not rendered" },
              },
            ],
          })),
        }),
      ) as typeof globalThis.fetch,
    });
    await client.refresh();
    expect(client.getState()).toMatchObject({ status: "unknown", canRecover: false });
    serverStatus = "interrupted";
    await client.refresh();
    expect(client.getState()).toMatchObject({
      status: "interrupted",
      canRecover: true,
      activities: [{ id: otherRequestId, status: "completed" }],
    });
    expect(JSON.stringify(client.getState())).not.toContain("not rendered");
  });

  it("accepts a full bounded twenty-turn history larger than 128KiB", async () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({
      id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
      status: "completed",
      input: { role: "user", text: "x".repeat(4000) },
      output: { role: "assistant", text: "界".repeat(16000) },
      actions: [],
    }));
    const client = createChatbotClient({
      endpoint: "/api/chat",
      createRequestId: () => requestId,
      initialSnapshot: { threadId },
      fetch: vi.fn(async () =>
        Response.json({ kind: "status", threadId, turns }),
      ) as typeof globalThis.fetch,
    });
    await client.refresh();
    expect(client.getState().error).toBeUndefined();
    expect(client.getState().messages).toHaveLength(40);
  });

  it("rejects oversized JSON as invalid instead of a network failure", async () => {
    const client = createChatbotClient({
      endpoint: "/api/chat",
      createRequestId: () => requestId,
      initialSnapshot: { threadId },
      fetch: vi.fn(async () => new Response(" ".repeat(4_000_001))) as typeof globalThis.fetch,
    });
    await client.refresh();
    expect(client.getState().error?.code).toBe("invalid_response");
  });

  it("parses canonical SDK SSE frames split at every UTF-8 byte and completes only on finish", async () => {
    const text = "Héllo\r\n世界🙂";
    const bytes = encodeEvents(events(text));
    const fetch = vi.fn(async () =>
      sseResponse([], { bytes: [...bytes].map((byte) => new Uint8Array([byte])) }),
    );
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
    });

    await client.send("Hello");

    expect(client.getState()).toMatchObject({ status: "completed", threadId, pending: undefined });
    expect(client.getState().messages).toEqual([
      { id: `user:${requestId}`, role: "user", text: "Hello" },
      { id: `assistant:${turnId}`, role: "assistant", text },
    ]);
    expect(mockCalls(fetch)[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it.each([
    ["error", { type: "error", errorText: "provider failed" }],
    ["abort", { type: "abort", reason: "interrupted" }],
  ])("preserves partial text and never completes after an SSE %s", async (_name, terminal) => {
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: vi.fn(async () => sseResponse(events("partial", terminal))) as typeof globalThis.fetch,
      createRequestId: () => requestId,
    });

    await client.send("Hello");

    expect(client.getState()).toMatchObject({
      status: "unknown",
      pending: { requestId, threadId, turnId },
    });
    expect(client.getState().messages).toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "partial",
    });
  });

  it("treats abrupt EOF and mismatched stream identity as unresolved, never completed", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(events("partial").slice(0, -2)))
      .mockResolvedValueOnce(sseResponse(events("ignored"), { requestId: otherRequestId }));
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
    });

    await client.send("Hello");
    expect(client.getState().status).toBe("unknown");
    expect(client.getState().messages).toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "partial",
    });

    await client.retryPending();
    expect(client.getState()).toMatchObject({ status: "unknown", pending: { requestId } });
    expect(client.getState().messages).not.toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "ignored",
    });
  });

  it("persists a pending request before sending and uses the exact replay JSON", async () => {
    const save = vi.fn(async () => undefined);
    const fetch = vi.fn(async () =>
      Response.json({ status: "completed", text: "Safe plain text", threadId, turnId }),
    );
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
      persistence: { save },
    });

    await client.send("Hello");

    expect(save.mock.invocationCallOrder[0]).toBeLessThan(
      fetch.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(client.getState()).toMatchObject({ status: "completed", threadId, pending: undefined });
  });

  it("keeps one logical message and request id for an initial network-unknown retry", async () => {
    const createRequestId = vi.fn(() => requestId);
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json({ status: "completed", text: "Done", threadId, turnId }),
      );
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId,
    });

    await client.send("Hello");
    await client.retryPending();

    const bodies = mockCalls(fetch).map(([, init]) =>
      JSON.parse((init as RequestInit).body as string),
    );
    expect(bodies).toEqual([
      { requestId, text: "Hello" },
      { requestId, text: "Hello" },
    ]);
    expect(createRequestId).toHaveBeenCalledOnce();
    expect(
      client.getState().messages.filter((message) => message.id === `user:${requestId}`),
    ).toHaveLength(1);
  });

  it("discovers and persists replay recovery ids after a lost initial acknowledgement", async () => {
    const save = vi.fn(async () => undefined);
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("acknowledgement lost"))
      .mockResolvedValueOnce(
        Response.json({ status: "interrupted", threadId, turnId }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({ kind: "completed", threadId, turnId, text: "Recovered", actions: [] }),
      );
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
      persistence: { save },
    });

    await client.send("Hello");
    await client.retryPending();
    expect(client.getState()).toMatchObject({
      status: "interrupted",
      pending: { requestId, text: "Hello", threadId, turnId },
      canRecover: true,
    });
    expect(save).toHaveBeenLastCalledWith({
      threadId,
      pending: { requestId, text: "Hello", threadId, turnId },
    });
    await client.recover();
    expect(JSON.parse((mockCalls(fetch)[2]?.[1] as RequestInit).body as string)).toEqual({
      type: "recover",
      threadId,
      turnId,
    });
    expect(client.getState()).toMatchObject({ status: "completed", pending: undefined, threadId });
  });

  it("does not fabricate ids from a generic conflict and requires status checking while running", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "turn_conflict" }, { status: 409 }))
      .mockResolvedValueOnce(
        Response.json({ status: "running", threadId, turnId }, { status: 409 }),
      );
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
    });
    await client.send("Hello");
    expect(client.getState()).toMatchObject({ status: "unknown", pending: { requestId } });
    expect(client.getState().pending).not.toMatchObject({ threadId, turnId });
    await client.retryPending();
    expect(client.getState()).toMatchObject({
      status: "unknown",
      pending: { requestId, threadId, turnId },
      canRecover: false,
    });
  });

  it("releases a failed initial persistence reservation so a later send can proceed", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValue(undefined);
    const fetch = vi.fn(async () =>
      Response.json({ status: "completed", text: "Done", threadId, turnId }),
    );
    const ids = [requestId, otherRequestId];
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => ids.shift() ?? requestId,
      persistence: { save },
    });
    await client.send("First");
    expect(client.getState().error?.code).toBe("persistence");
    await client.send("Second");
    expect(fetch).toHaveBeenCalledOnce();
    expect(client.getState()).toMatchObject({ status: "completed", pending: undefined });
  });

  it("leaves no active reservation when stop wins during initial persistence", async () => {
    const saveGate = deferred<void>();
    const fetch = vi.fn(async () =>
      Response.json({ status: "completed", text: "Done", threadId, turnId }),
    );
    const ids = [requestId, otherRequestId];
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => ids.shift() ?? requestId,
      persistence: { save: vi.fn(() => saveGate.promise) },
    });
    const first = client.send("First");
    await Promise.resolve();
    client.stop();
    saveGate.resolve();
    await first;
    expect(fetch).not.toHaveBeenCalled();
    expect(client.getState().status).toBe("interrupted");
    await client.send("Second");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("notifies acceptance only after persistence, before a pending network response", async () => {
    const gate = deferred<Response>();
    const accepted = vi.fn();
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: vi.fn(() => gate.promise) as typeof globalThis.fetch,
      createRequestId: () => requestId,
      persistence: { save: vi.fn(async () => undefined) },
    });
    const sending = client.send("Hello", accepted);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(accepted).toHaveBeenCalledOnce();
    expect(client.getState()).toMatchObject({ status: "streaming", pending: { requestId } });
    gate.resolve(Response.json({ status: "completed", text: "Done", threadId, turnId }));
    await sending;

    const failed = vi.fn();
    const rejected = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: vi.fn() as typeof globalThis.fetch,
      createRequestId: () => requestId,
      persistence: {
        save: async () => {
          throw new Error("quota");
        },
      },
    });
    await rejected.send("Hello", failed);
    expect(failed).not.toHaveBeenCalled();
  });

  it("retains partial pending state for running status, then persists and clears it on completed status", async () => {
    const save = vi.fn(async () => undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(events("partial").slice(0, -2)))
      .mockResolvedValueOnce(Response.json(status("running", null)))
      .mockResolvedValueOnce(Response.json(status("completed", "Durably completed")));
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
      persistence: { save },
    });

    await client.send("Hello");
    await client.refresh();
    expect(client.getState()).toMatchObject({
      status: "unknown",
      pending: { requestId, threadId, turnId },
    });
    expect(client.getState().messages).toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "partial",
    });

    await client.refresh();
    expect(client.getState()).toMatchObject({ status: "completed", threadId, pending: undefined });
    expect(client.getState().messages).toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "Durably completed",
    });
    expect(save).toHaveBeenLastCalledWith({ threadId });
    expect(mockCalls(fetch)[1]?.[0]).toBe(
      `https://app.example.test/api/chat?threadId=${encodeURIComponent(threadId)}`,
    );
  });

  it("uses exact recovery JSON for completed and unresolved recovery outcomes", async () => {
    const completedFetch = vi.fn(async () =>
      Response.json({ kind: "completed", threadId, turnId, text: "Recovered", actions: [] }),
    );
    const completed = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: completedFetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
      initialSnapshot: { threadId, pending: { requestId, text: "Hello", threadId, turnId } },
    });

    await completed.recover();
    expect(completed.getState()).toMatchObject({ status: "completed", pending: undefined });
    expect(JSON.parse((mockCalls(completedFetch)[0]?.[1] as RequestInit).body as string)).toEqual({
      type: "recover",
      threadId,
      turnId,
    });

    const unresolvedFetch = vi.fn(async () =>
      Response.json({ kind: "unresolved", threadId, turnId, actions: [] }, { status: 409 }),
    );
    const unresolved = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: unresolvedFetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
      initialSnapshot: { threadId, pending: { requestId, text: "Hello", threadId, turnId } },
    });
    await unresolved.recover();

    expect(JSON.parse((mockCalls(unresolvedFetch)[0]?.[1] as RequestInit).body as string)).toEqual({
      type: "recover",
      threadId,
      turnId,
    });
    expect(unresolved.getState()).toMatchObject({
      status: "unknown",
      pending: { requestId, threadId, turnId },
      error: { code: "conflict" },
    });
  });

  it("refuses concurrent sends while pending persistence is unresolved", async () => {
    const saveGate = deferred<void>();
    const save = vi.fn(() => saveGate.promise);
    const fetch = vi.fn(async () =>
      Response.json({ status: "completed", text: "Done", threadId, turnId }),
    );
    const createRequestId = vi.fn(() => requestId);
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId,
      persistence: { save },
    });

    const first = client.send("First");
    await Promise.resolve();
    const second = client.send("Second");
    saveGate.resolve();
    await Promise.all([first, second]);

    expect(save).toHaveBeenCalledTimes(2); // pending save, then finalized snapshot
    expect(fetch).toHaveBeenCalledOnce();
    expect(createRequestId).toHaveBeenCalledOnce();
    expect(JSON.parse((mockCalls(fetch)[0]?.[1] as RequestInit).body as string)).toMatchObject({
      text: "First",
    });
  });

  it("invalidates a blocked reader on stop so late SSE chunks cannot change state", async () => {
    const identified = deferred<void>();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
    });
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: vi.fn(
        async () =>
          new Response(body, {
            headers: {
              "content-type": "text/event-stream",
              "x-chatbot-request-id": requestId,
              "x-chatbot-thread-id": threadId,
              "x-chatbot-turn-id": turnId,
            },
          }),
      ) as typeof globalThis.fetch,
      createRequestId: () => requestId,
    });
    client.subscribe(() => {
      if (client.getState().pending?.threadId === threadId) identified.resolve();
    });

    const sending = client.send("Hello");
    await identified.promise;
    client.stop();
    controller.enqueue(encodeEvents(events("late")));
    controller.close();
    await sending;

    expect(client.getState().status).toBe("interrupted");
    expect(client.getState().pending).toMatchObject({ requestId, threadId, turnId });
    expect(client.getState().messages).not.toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "late",
    });
  });

  it("dispose prevents late fetch and persistence completions from repopulating state", async () => {
    const responseGate = deferred<Response>();
    const fetch = vi.fn(() => responseGate.promise);
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
    });
    const sending = client.send("Hello");
    await Promise.resolve();
    client.dispose();
    responseGate.resolve(Response.json({ status: "completed", text: "Late", threadId, turnId }));
    await sending;
    expect(client.getState().messages).not.toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "Late",
    });

    const saveGate = deferred<void>();
    const secondSaveStarted = deferred<void>();
    let saves = 0;
    const save = vi.fn(() => {
      saves++;
      if (saves === 1) return undefined;
      secondSaveStarted.resolve();
      return saveGate.promise;
    });
    const persisted = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: vi.fn(async () =>
        Response.json({ status: "completed", text: "Late persist", threadId, turnId }),
      ) as typeof globalThis.fetch,
      createRequestId: () => requestId,
      persistence: { save },
    });
    const completing = persisted.send("Hello");
    await secondSaveStarted.promise;
    persisted.dispose();
    saveGate.resolve();
    await completing;
    expect(persisted.getState().messages).not.toContainEqual({
      id: `assistant:${turnId}`,
      role: "assistant",
      text: "Late persist",
    });
  });

  it("clears private state on unauthorized responses and keeps 429 and 412 distinct", async () => {
    const clear = vi.fn(async () => undefined);
    const unauthorized = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: vi.fn(async () =>
        Response.json({ error: "unauthorized" }, { status: 401 }),
      ) as typeof globalThis.fetch,
      createRequestId: () => requestId,
      persistence: { save: async () => undefined, clear },
      initialSnapshot: { threadId },
    });
    await unauthorized.send("Hello");
    expect(clear).toHaveBeenCalledOnce();
    expect(unauthorized.getState().status).toBe("error");
    expect(unauthorized.getState().threadId).toBeUndefined();
    expect(unauthorized.getState().pending).toBeUndefined();

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "17" } }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: "unsupported_contract_epoch" }, { status: 412 }),
      );
    const client = createChatbotClient({
      endpoint: "https://app.example.test/api/chat",
      fetch: fetch as typeof globalThis.fetch,
      createRequestId: () => requestId,
    });
    await client.send("Hello");
    expect(client.getState().error).toEqual({ code: "rate_limited", retryAfterSeconds: 17 });
    await client.retryPending();
    expect(client.getState().error?.code).toBe("update_client");
  });
});
