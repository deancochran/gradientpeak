#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";

// @repo/db/client creates a module-level pool. This inert local value only permits
// importing the repository; every executable context below uses the disposable URL.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Importing the complete router constructs an unused storage client. Keep its
// configuration inert and local so this disposable test can never contact a provider.
process.env.NEXT_PRIVATE_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY ??= "disposable-local-storage-key";

type ClaimedTurn = { id: string; threadId: string; status: string };

/**
 * Proves the durable host state machine directly against a fresh, attested local
 * PostgreSQL target. It intentionally does not claim any unimplemented host/API flow.
 */
await withDisposableDatabase(process.argv.slice(2), "api_chatbot_host", async (target, url) => {
  await bootstrapSupabaseSchemas(target);
  for (const migration of requireFreshBaseline().migrationPaths)
    await applySqlFile(target, migration);

  const actorId = randomUUID();
  const otherId = randomUUID();
  const insertProfile = async (id: string) => {
    await target.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,'{}')", [
      id,
      `${id}@chatbot-host.test`,
    ]);
    await target.query(
      `insert into public.profiles(id,email,full_name,username,language,preferred_units,onboarding_status,is_public,planning_timezone)
       values ($1,$2,$3,$4,'en','metric','completed',false,'UTC')
       on conflict (id) do update set email=excluded.email,full_name=excluded.full_name,
         username=excluded.username,language=excluded.language,preferred_units=excluded.preferred_units,
         onboarding_status=excluded.onboarding_status,is_public=excluded.is_public,
         planning_timezone=excluded.planning_timezone`,
      [id, `${id}@chatbot-host.test`, `Chatbot ${id.slice(0, 8)}`, `chatbot-${id.slice(0, 8)}`],
    );
  };
  await insertProfile(actorId);
  await insertProfile(otherId);
  const conversationId = randomUUID();
  await target.query("insert into public.conversations(id,is_group) values ($1,false)", [
    conversationId,
  ]);
  await target.query(
    "insert into public.conversation_participants(conversation_id,user_id) values ($1,$2),($1,$3)",
    [conversationId, actorId, otherId],
  );

  const [
    { createDbClient },
    { createDrizzleChatbotHistoryRepository },
    { createApiContext },
    { createChatbotHost },
    { createChatbotRecoveryService },
    { MockLanguageModelV4 },
  ] = await Promise.all([
    import("@repo/db/client"),
    import("../src/repositories/chatbot-history-repository"),
    import("../src/context"),
    import("../src/application/chatbot/host"),
    import("../src/application/chatbot/recovery"),
    import("ai/test"),
  ]);
  const { parseJsonEventStream, uiMessageChunkSchema } = await import("ai");
  // Separate pools ensure the concurrency assertions use independent database connections.
  const clientA = createDbClient({ url }, { max: 4 });
  const clientB = createDbClient({ url }, { max: 4 });
  const now = new Date("2026-10-30T12:00:00.000Z");
  const repository = createDrizzleChatbotHistoryRepository(clientA.db, { now: () => now });
  const concurrentRepository = createDrizzleChatbotHistoryRepository(clientB.db, {
    now: () => now,
  });
  const request = (
    overrides: Partial<{ requestId: string; text: string; threadId: string }> = {},
  ) => ({
    requestId: randomUUID(),
    text: "Plan an easy run",
    ...overrides,
  });
  const claim = async (input: ReturnType<typeof request>, repo = repository, at = now) =>
    repo.claim({ actorId, request: input, now: at, leaseMs: 60_000 });
  const claimed = (value: Awaited<ReturnType<typeof claim>>): ClaimedTurn => {
    assert.equal(value.kind, "claimed");
    return value.turn;
  };

  try {
    const firstRequest = request();
    const first = claimed(await claim(firstRequest));
    const duplicate = await claim(firstRequest);
    assert.equal(duplicate.kind, "duplicate");
    if (duplicate.kind === "duplicate") {
      assert.equal(
        duplicate.turn.threadId,
        first.threadId,
        "implicit thread is stable across retry",
      );
      assert.equal(duplicate.turn.id, first.id, "same request retry returns the original turn");
    }
    assert.equal(
      (
        await target.query("select count(*)::int count from public.chatbot_threads where id=$1", [
          first.threadId,
        ])
      ).rows[0]?.count,
      1,
      "an implicit first request creates one thread",
    );
    await repository.finish({
      actorId,
      turnId: first.id,
      status: "completed",
      output: { role: "assistant", text: "Easy run planned." },
      now,
    });

    const concurrentThreadId = randomUUID();
    const sameRequest = request({ threadId: concurrentThreadId });
    const [concurrentA, concurrentB] = await Promise.all([
      claim(sameRequest, repository),
      claim(sameRequest, concurrentRepository),
    ]);
    assert.deepEqual(
      [concurrentA.kind, concurrentB.kind].sort(),
      ["claimed", "duplicate"],
      "simultaneous same request produces one turn and one replay",
    );
    const concurrentTurn = claimed(concurrentA.kind === "claimed" ? concurrentA : concurrentB);
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.chatbot_turns where thread_id=$1",
          [concurrentThreadId],
        )
      ).rows[0]?.count,
      1,
    );
    assert.equal((await claim({ ...sameRequest, text: "Changed request text" })).kind, "conflict");
    await repository.finish({ actorId, turnId: concurrentTurn.id, status: "completed", now });

    const activeThreadId = randomUUID();
    const [activeA, activeB] = await Promise.all([
      claim(request({ threadId: activeThreadId }), repository),
      claim(request({ threadId: activeThreadId }), concurrentRepository),
    ]);
    assert.deepEqual(
      [activeA.kind, activeB.kind].sort(),
      ["active", "claimed"],
      "different simultaneous requests cannot both run on a thread",
    );
    const activeTurn = claimed(activeA.kind === "claimed" ? activeA : activeB);
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.chatbot_turns where thread_id=$1 and status='running'",
          [activeThreadId],
        )
      ).rows[0]?.count,
      1,
    );
    assert.equal(
      (
        await concurrentRepository.claim({
          actorId: otherId,
          request: request({ threadId: activeThreadId }),
          now,
          leaseMs: 60_000,
        })
      ).kind,
      "denied",
      "a thread owner boundary rejects another profile",
    );

    const expiredAt = new Date(now.getTime() + 60_001);
    assert.equal(
      await repository.interruptExpired(expiredAt),
      1,
      "the injected clock expires a running lease",
    );
    assert.equal(
      await repository.finish({
        actorId,
        turnId: activeTurn.id,
        status: "completed",
        now: expiredAt,
      }),
      false,
      "a late host completion cannot overwrite interruption",
    );
    assert.equal(
      (await target.query("select status from public.chatbot_turns where id=$1", [activeTurn.id]))
        .rows[0]?.status,
      "interrupted",
    );

    const actionTurn = claimed(await claim(request({ threadId: randomUUID() })));
    const action = await repository.persistAction({
      actorId,
      turnId: actionTurn.id,
      toolCallId: "call-stable",
      toolId: "api.activities.list",
      input: { limit: 5, filter: "recent" },
      now,
    });
    assert.notEqual(typeof action, "string");
    if (typeof action === "string") throw new Error("Expected a persisted action");
    const replayedAction = await repository.persistAction({
      actorId,
      turnId: actionTurn.id,
      toolCallId: "call-stable",
      toolId: "api.activities.list",
      input: { filter: "recent", limit: 5 },
      now,
    });
    assert.notEqual(typeof replayedAction, "string");
    if (typeof replayedAction !== "string") assert.equal(replayedAction.actionId, action.actionId);
    assert.equal(
      await repository.persistAction({
        actorId,
        turnId: actionTurn.id,
        toolCallId: "call-stable",
        toolId: "api.activities.list",
        input: { limit: 10 },
        now,
      }),
      "conflict",
    );
    const distinctAction = await repository.persistAction({
      actorId,
      turnId: actionTurn.id,
      toolCallId: "call-distinct",
      toolId: "api.activities.list",
      input: { limit: 5, filter: "recent" },
      now,
    });
    assert.notEqual(typeof distinctAction, "string");
    if (typeof distinctAction !== "string")
      assert.notEqual(distinctAction.actionId, action.actionId);
    assert.equal(
      await repository.persistAction({
        actorId: otherId,
        turnId: actionTurn.id,
        toolCallId: "other",
        toolId: "api.activities.list",
        input: {},
        now,
      }),
      "inactive",
      "a nonowner cannot persist an action",
    );
    assert.equal(
      await repository.finishAction({
        actorId,
        turnId: actionTurn.id,
        actionId: action.actionId,
        status: "completed",
        result: { items: [] },
        now,
      }),
      true,
    );
    assert.equal(
      await repository.finishAction({
        actorId,
        turnId: actionTurn.id,
        actionId: action.actionId,
        status: "failed",
        result: { error: "late" },
        now,
      }),
      false,
      "a terminal action result is not overwritten",
    );
    assert.equal(
      (
        await target.query("select status,result from public.chatbot_actions where id=$1", [
          action.id,
        ])
      ).rows[0]?.status,
      "completed",
    );
    await repository.finish({ actorId, turnId: actionTurn.id, status: "completed", now });
    assert.equal(
      await repository.persistAction({
        actorId,
        turnId: actionTurn.id,
        toolCallId: "after-terminal",
        toolId: "api.activities.list",
        input: {},
        now,
      }),
      "inactive",
      "actions are only accepted for an owned live turn",
    );
    // A host may lose its acknowledgement after a write has committed.  The
    // next turn is blocked rather than silently generating against ambiguous
    // thread history; recovery owns reconciliation of this receipt.
    const guardedThreadId = randomUUID();
    const guardedTurn = claimed(await claim(request({ threadId: guardedThreadId })));
    const guardedAction = await repository.persistAction({
      actorId,
      turnId: guardedTurn.id,
      toolCallId: "possibly-committed",
      toolId: "api.messaging.send",
      input: { content: "durable intent" },
      now,
    });
    assert.notEqual(typeof guardedAction, "string");
    await repository.finish({ actorId, turnId: guardedTurn.id, status: "interrupted", now });
    assert.equal(
      (await claim(request({ threadId: guardedThreadId }))).kind,
      "recovery_required",
      "a new generation cannot pass an interrupted action receipt",
    );

    const corruptTurn = claimed(await claim(request({ threadId: randomUUID() })));
    await target.query("update public.chatbot_turns set input=$1::jsonb where id=$2", [
      JSON.stringify({ role: "system", text: "bad" }),
      corruptTurn.id,
    ]);
    await assert.rejects(
      repository.history(actorId, corruptTurn.threadId),
      /Corrupt chatbot history/,
    );

    const historyThread = randomUUID();
    const historyTurns: ClaimedTurn[] = [];
    for (let index = 0; index < 42; index += 1) {
      const current = claimed(
        await claim(request({ threadId: historyThread, text: `message ${index}` })),
      );
      historyTurns.push(current);
      await repository.finish({
        actorId,
        turnId: current.id,
        status: "completed",
        output: { role: "assistant", text: `reply ${index}` },
        now,
      });
      await target.query("update public.chatbot_turns set created_at=$1 where id=$2", [
        new Date(now.getTime() + index * 1_000),
        current.id,
      ]);
    }
    const history = await repository.history(actorId, historyThread);
    assert.equal(history?.length, 80, "history is bounded to the newest forty turns");
    assert.deepEqual(history?.slice(0, 2), [
      { role: "user", text: "message 2" },
      { role: "assistant", text: "reply 2" },
    ]);
    assert.deepEqual(history?.slice(-2), [
      { role: "user", text: "message 41" },
      { role: "assistant", text: "reply 41" },
    ]);
    assert.deepEqual(
      await repository.history(actorId, historyThread),
      history,
      "bounded history ordering is deterministic",
    );

    // This is intentionally a host journey rather than another adapter mock: the
    // model emits the provider tool call, the host persists its receipt, and the
    // existing actor-bound API executor writes through the normal router.
    const hostContext = await createApiContext({
      db: clientA.db,
      headers: new Headers(),
      auth: {
        session: {
          sessionId: randomUUID(),
          transport: "cookie",
          user: { id: actorId, email: `${actorId}@chatbot-host.test`, emailVerified: true },
        },
      },
    });
    const hostThreadId = randomUUID();
    const hostRequestId = randomUUID();
    let modelCalls = 0;
    const hostUsage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    };
    const hostModel = () => {
      let step = 0;
      return new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              if (step++ === 0) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: "host-message-call",
                  toolName: "api_messaging_send-message",
                  input: JSON.stringify({
                    conversation_id: conversationId,
                    content: "host journey message",
                  }),
                });
              } else {
                controller.enqueue({ type: "text-start", id: "host-answer" });
                controller.enqueue({
                  type: "text-delta",
                  id: "host-answer",
                  delta: "Message sent.",
                });
                controller.enqueue({ type: "text-end", id: "host-answer" });
              }
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: hostUsage,
              });
              controller.close();
            },
          }),
        }),
      });
    };
    const host = createChatbotHost({
      now: () => now,
      repository,
      modelRouter: {
        resolve: async () => {
          modelCalls += 1;
          return {
            model: hostModel(),
            modelId: "host-test",
            selectedTier: "fast",
            selectionReason: "fixed",
          };
        },
      },
    });
    const hostRequest = {
      requestId: hostRequestId,
      threadId: hostThreadId,
      text: "Send a message",
    };
    const firstHostResult = await host(hostContext, hostRequest);
    assert.ok(firstHostResult instanceof Response, "first host request returns a stream response");
    await firstHostResult.text();
    assert.equal(modelCalls, 1, "one model is selected for the initial request");
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.messages where content='host journey message'",
        )
      ).rows[0]?.count,
      1,
    );
    const [storedAction] = (
      await target.query(
        "select input,status from public.chatbot_actions where turn_id=(select id from public.chatbot_turns where thread_id=$1 and request_id=$2)",
        [hostThreadId, hostRequestId],
      )
    ).rows as Array<{ input: Record<string, unknown>; status: string }>;
    assert.deepEqual(
      storedAction?.input,
      { content: "host journey message", conversation_id: conversationId },
      "the receipt stores canonical model input without the injected operation ID",
    );
    assert.equal(storedAction?.status, "completed");
    const [storedTurn] = (
      await target.query(
        "select status,output from public.chatbot_turns where thread_id=$1 and request_id=$2",
        [hostThreadId, hostRequestId],
      )
    ).rows as Array<{ status: string; output: { text: string } }>;
    assert.equal(storedTurn?.status, "completed");
    assert.equal(storedTurn?.output.text, "Message sent.");

    const replay = await host(hostContext, hostRequest);
    assert.deepEqual(replay, {
      kind: "replay",
      threadId: hostThreadId,
      turnId: (
        await target.query(
          "select id from public.chatbot_turns where thread_id=$1 and request_id=$2",
          [hostThreadId, hostRequestId],
        )
      ).rows[0]?.id,
      text: "Message sent.",
    });
    assert.equal(modelCalls, 1, "completed retry does not select or regenerate a model");
    const changed = await host(hostContext, { ...hostRequest, text: "Different request" });
    assert.deepEqual(changed, {
      kind: "error",
      status: 409,
      code: "turn_conflict",
      message: "A conflicting chatbot request is already in progress.",
    });

    // Match the browser fixture's exact write-then-stall sequence through the
    // real executor. The client decoder must receive valid tool and text chunks
    // before Stop interrupts the turn; recovery must not regenerate or duplicate.
    const diaryThreadId = randomUUID();
    const diaryRequestId = randomUUID();
    let diaryModelCalls = 0;
    const diaryModel = new MockLanguageModelV4({
      doStream: [
        {
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
                usage: hostUsage,
              });
              controller.close();
            },
          }),
        },
        {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              controller.enqueue({ type: "text-start", id: "acceptance-response" });
              controller.enqueue({
                type: "text-delta",
                id: "acceptance-response",
                delta: "Acceptance action is streaming",
              });
              // Deliberately never close: the browser Stop control owns this interruption.
            },
          }),
        },
      ],
    });
    const diaryHost = createChatbotHost({
      now: () => now,
      repository,
      modelRouter: {
        resolve: async () => {
          diaryModelCalls += 1;
          return {
            model: diaryModel,
            modelId: "diary-fixture",
            selectedTier: "fast",
            selectionReason: "fixed",
          };
        },
      },
    });
    const diaryResponse = await diaryHost(hostContext, {
      requestId: diaryRequestId,
      threadId: diaryThreadId,
      text: "acceptance: action recovery",
    });
    assert.ok(diaryResponse instanceof Response, "diary fixture returns an SSE response");
    assert.ok(diaryResponse.body, "diary fixture has a stream body");
    const decodedTypes: string[] = [];
    const decoded = parseJsonEventStream({
      stream: diaryResponse.body,
      schema: uiMessageChunkSchema,
    })[Symbol.asyncIterator]();
    try {
      for (;;) {
        const next = await decoded.next();
        assert.equal(next.done, false, "stalled fixture emits text before it is stopped");
        assert.equal(next.value?.success, true, "every fixture event passes the client decoder");
        if (!next.value?.success || !next.value.value) continue;
        decodedTypes.push(next.value.value.type);
        if (next.value.value.type === "text-delta") break;
      }
    } finally {
      await decoded.return?.();
    }
    assert.ok(decodedTypes.includes("tool-input-available"));
    assert.ok(decodedTypes.includes("tool-output-available"));
    assert.ok(decodedTypes.includes("text-delta"));
    assert.equal(diaryModelCalls, 1, "Stop does not select a replacement model");
    const [diaryReceipt] = (
      await target.query(
        "select action_id,status,result from public.chatbot_actions where turn_id=(select id from public.chatbot_turns where thread_id=$1 and request_id=$2)",
        [diaryThreadId, diaryRequestId],
      )
    ).rows as Array<{ action_id: string; status: string; result: unknown }>;
    assert.equal(diaryReceipt?.status, "completed", "the diary write has a completed receipt");
    const [diaryTurn] = (
      await target.query(
        "select id,status from public.chatbot_turns where thread_id=$1 and request_id=$2",
        [diaryThreadId, diaryRequestId],
      )
    ).rows as Array<{ id: string; status: string }>;
    for (let attempt = 0; diaryTurn?.status === "running" && attempt < 100; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      diaryTurn.status = (
        await target.query("select status from public.chatbot_turns where id=$1", [diaryTurn.id])
      ).rows[0]?.status;
    }
    assert.equal(diaryTurn?.status, "interrupted", "Stop interrupts the stalled turn");
    assert.ok(diaryTurn, "diary turn exists");
    const diaryRecovery = createChatbotRecoveryService({ repository, now: () => now });
    assert.equal(
      (await diaryRecovery.recover(hostContext, { threadId: diaryThreadId, turnId: diaryTurn.id }))
        .kind,
      "completed",
      "recovery finalizes the interrupted receipt without regenerating",
    );
    assert.equal(diaryModelCalls, 1, "recovery does not select a replacement model");
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.activities where profile_id=$1 and name='Acceptance recovery run'",
          [actorId],
        )
      ).rows[0]?.count,
      1,
      "the fixed diary action has one durable activity",
    );
    const [recoveredDiaryReceipt] = (
      await target.query(
        "select action_id,status,result from public.chatbot_actions where turn_id=$1",
        [diaryTurn.id],
      )
    ).rows as Array<{ action_id: string; status: string; result: unknown }>;
    assert.deepEqual(recoveredDiaryReceipt, diaryReceipt, "recovery retains the same receipt");
    const otherContext = await createApiContext({
      db: clientB.db,
      headers: new Headers(),
      auth: {
        session: {
          sessionId: randomUUID(),
          transport: "cookie",
          user: { id: otherId, email: `${otherId}@chatbot-host.test`, emailVerified: true },
        },
      },
    });
    const denied = await host(otherContext, {
      requestId: randomUUID(),
      threadId: hostThreadId,
      text: "Not mine",
    });
    assert.deepEqual(denied, {
      kind: "error",
      status: 404,
      code: "not_found",
      message: "The chatbot thread is not available.",
    });

    const concurrentRequest = {
      requestId: randomUUID(),
      threadId: randomUUID(),
      text: "Send a message",
    };
    const [parallelA, parallelB] = await Promise.all([
      host(hostContext, concurrentRequest),
      host(hostContext, concurrentRequest),
    ]);
    const parallelResponses = [parallelA, parallelB].filter(
      (value): value is Response => value instanceof Response,
    );
    assert.equal(
      parallelResponses.length,
      1,
      "parallel identical submissions have one stream producer",
    );
    await parallelResponses[0]?.text();
    assert.equal(modelCalls, 2, "parallel identical submissions select one additional model");

    const secondRequest = {
      requestId: randomUUID(),
      threadId: hostThreadId,
      text: "Send another message",
    };
    const secondHostResult = await host(hostContext, secondRequest);
    assert.ok(secondHostResult instanceof Response);
    await secondHostResult.text();
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.messages where content='host journey message'",
        )
      ).rows[0]?.count,
      3,
      "different intentional calls with identical arguments are not deduplicated",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.chatbot_actions where tool_call_id='host-message-call'",
        )
      ).rows[0]?.count,
      3,
      "each intentional turn receives a distinct persisted action",
    );

    // Lost acknowledgement after a durable message receipt: recovery executes the
    // normal actor-bound executor with the same operation ID, then unblocks the thread.
    const recoveryThreadId = randomUUID();
    const recoveryTurn = claimed(await claim(request({ threadId: recoveryThreadId })));
    const recoveryAction = await repository.persistAction({
      actorId,
      turnId: recoveryTurn.id,
      toolCallId: "lost-ack",
      toolId: "api.messaging.send-message",
      input: { conversation_id: conversationId, content: "recovered message" },
      now,
    });
    assert.notEqual(typeof recoveryAction, "string");
    await repository.finish({ actorId, turnId: recoveryTurn.id, status: "interrupted", now });
    assert.equal((await claim(request({ threadId: recoveryThreadId }))).kind, "recovery_required");
    const recovery = createChatbotRecoveryService({ repository, now: () => now });
    const recovered = await recovery.recover(hostContext, {
      threadId: recoveryThreadId,
      turnId: recoveryTurn.id,
    });
    assert.equal(recovered.kind, "completed");
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.messages where content='recovered message'",
        )
      ).rows[0]?.count,
      1,
    );
    assert.equal(
      (await claim(request({ threadId: recoveryThreadId }))).kind,
      "claimed",
      "recovery finalization admits the next turn",
    );

    // Queue a stale host behind a successor on the exact advisory-lock namespace.
    // The query barrier proves both independent connections are waiting before the
    // holder releases, so the successor interrupts first and the stale host must
    // revalidate after it acquires the lock.
    const interleavingThreadId = randomUUID();
    const staleClock = new Date("2020-01-01T00:00:00.000Z");
    const staleTurn = claimed(
      await claim(request({ threadId: interleavingThreadId }), repository, staleClock),
    );
    const lock = await target.connect();
    try {
      await lock.query("begin");
      await lock.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        interleavingThreadId,
      ]);
      const successor = concurrentRepository.claim({
        actorId,
        request: request({ threadId: interleavingThreadId }),
        now,
        leaseMs: 60_000,
      });
      const staleAction = createDrizzleChatbotHistoryRepository(clientA.db).persistAction({
        actorId,
        turnId: staleTurn.id,
        toolCallId: "stale-after-successor",
        toolId: "api.messaging.send-message",
        input: { conversation_id: conversationId, content: "must not write" },
        now: staleClock,
      });
      for (let attempt = 0; attempt < 1_000; attempt += 1) {
        const waiting = await clientB.db.$client.query<{ count: number }>(
          `select count(*)::int as count from pg_stat_activity
           where datname=current_database() and wait_event_type='Lock' and wait_event='advisory'`,
        );
        if (waiting.rows[0]?.count === 2) break;
        if (attempt === 999)
          throw new Error("chatbot advisory-lock interleaving barrier timed out");
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      await lock.query("commit");
      const [successorResult, staleResult] = await Promise.all([successor, staleAction]);
      assert.equal(successorResult.kind, "claimed", "the queued successor claims the expired turn");
      assert.equal(staleResult, "inactive", "a post-lock recheck rejects the stale host");
      const interleaving = await repository.status({ actorId, threadId: interleavingThreadId });
      assert.equal(
        interleaving?.find((candidate) => candidate.id === staleTurn.id)?.actions.length,
        0,
        "the stale host cannot leave a receipt for recovery to replay",
      );
      assert.equal(
        interleaving?.find((candidate) => candidate.id !== staleTurn.id)?.status,
        "running",
        "the successor remains the sole live turn",
      );
    } finally {
      await lock.query("rollback").catch(() => undefined);
      lock.release();
    }

    // Concurrent retries of the same unknown receipt reauthorize through the
    // ordinary executor, but its durable operation ID produces one domain write.
    const concurrentRecoveryThreadId = randomUUID();
    const concurrentRecoveryTurn = claimed(
      await claim(request({ threadId: concurrentRecoveryThreadId })),
    );
    const concurrentRecoveryAction = await repository.persistAction({
      actorId,
      turnId: concurrentRecoveryTurn.id,
      toolCallId: "concurrent-lost-ack",
      toolId: "api.messaging.send-message",
      input: { conversation_id: conversationId, content: "concurrent recovered message" },
      now,
    });
    assert.notEqual(typeof concurrentRecoveryAction, "string");
    await repository.finish({
      actorId,
      turnId: concurrentRecoveryTurn.id,
      status: "interrupted",
      now,
    });
    const concurrentRecoveryA = createChatbotRecoveryService({ repository, now: () => now });
    const concurrentRecoveryB = createChatbotRecoveryService({
      repository: concurrentRepository,
      now: () => now,
    });
    const [recoveryA, recoveryB] = await Promise.all([
      concurrentRecoveryA.recover(hostContext, {
        threadId: concurrentRecoveryThreadId,
        turnId: concurrentRecoveryTurn.id,
      }),
      concurrentRecoveryB.recover(hostContext, {
        threadId: concurrentRecoveryThreadId,
        turnId: concurrentRecoveryTurn.id,
      }),
    ]);
    assert.equal(recoveryA.kind, "completed");
    assert.equal(recoveryB.kind, "completed");
    assert.equal(
      (
        await target.query(
          "select count(*)::int count from public.messages where content='concurrent recovered message'",
        )
      ).rows[0]?.count,
      1,
      "concurrent recovery replays one durable domain effect",
    );
    const repeatedRecovery = await concurrentRecoveryA.recover(hostContext, {
      threadId: concurrentRecoveryThreadId,
      turnId: concurrentRecoveryTurn.id,
    });
    assert.equal(repeatedRecovery.kind, "completed", "completed recovery retries remain truthful");
    const wrongActorRecovery = await concurrentRecoveryA.recover(otherContext, {
      threadId: concurrentRecoveryThreadId,
      turnId: concurrentRecoveryTurn.id,
    });
    assert.deepEqual(wrongActorRecovery, { kind: "error", status: 404, code: "not_found" });
    console.info(
      "[api:chatbot-host] repository checks and SDK-to-host-to-executor message journey passed",
    );
  } finally {
    await Promise.all([clientA.close(), clientB.close()]);
  }
});
