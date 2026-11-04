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
// importing server modules; all executable contexts below use the disposable URL.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.NEXT_PRIVATE_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY ??= "disposable-chatbot-storage-key";

async function expectCode(run: Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

/** Exercises chatbot receipt writes against a fresh, harness-attested local PostgreSQL target. */
await withDisposableDatabase(process.argv.slice(2), "api_chatbot_writes", async (target, url) => {
  await bootstrapSupabaseSchemas(target);
  for (const migration of requireFreshBaseline().migrationPaths)
    await applySqlFile(target, migration);

  const actorId = randomUUID();
  const otherId = randomUUID();
  const deniedId = randomUUID();
  const conversationId = randomUUID();
  const insertProfile = async (id: string) => {
    await target.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,'{}')", [
      id,
      `${id}@chatbot-write.test`,
    ]);
    await target.query(
      `insert into public.profiles(id,email,full_name,username,language,preferred_units,onboarding_status,is_public,planning_timezone)
       values ($1,$2,$3,$4,'en','metric','completed',false,'UTC')
       on conflict (id) do update set email=excluded.email,full_name=excluded.full_name,username=excluded.username,
         language=excluded.language,preferred_units=excluded.preferred_units,onboarding_status=excluded.onboarding_status,
         is_public=excluded.is_public,planning_timezone=excluded.planning_timezone`,
      [id, `${id}@chatbot-write.test`, `Chatbot ${id.slice(0, 8)}`, `chatbot-${id.slice(0, 8)}`],
    );
  };
  await insertProfile(actorId);
  await insertProfile(otherId);
  await insertProfile(deniedId);
  await target.query("insert into public.conversations(id,is_group) values ($1,false)", [
    conversationId,
  ]);
  await target.query(
    "insert into public.conversation_participants(conversation_id,user_id) values ($1,$2),($1,$3)",
    [conversationId, actorId, otherId],
  );

  const [
    { createDbClient },
    { createApiContext },
    { appRouter },
    { createChatbotApiExecutor },
    { createChatbotAiSdkTools },
    { executeWithOperationReceipt },
    { generateText },
    { MockLanguageModelV4 },
    { z },
  ] = await Promise.all([
    import("@repo/db/client"),
    import("../src/context"),
    import("../src/routers"),
    import("../src/chatbot"),
    import("../src/chatbot/ai-sdk"),
    import("../src/application/operation-receipts"),
    import("ai"),
    import("ai/test"),
    import("zod"),
  ]);
  const client = createDbClient({ url });
  try {
    const callerFor = async (id: string) =>
      appRouter.createCaller(
        await createApiContext({
          db: client.db,
          headers: new Headers(),
          auth: {
            session: {
              sessionId: randomUUID(),
              transport: "cookie",
              user: { id, email: `${id}@chatbot-write.test`, emailVerified: true },
            },
          },
        }),
      );
    const actor = await callerFor(actorId);
    const denied = await callerFor(deniedId);
    const executorFor = async (id: string) =>
      createChatbotApiExecutor(
        await createApiContext({
          db: client.db,
          headers: new Headers(),
          auth: {
            session: {
              sessionId: randomUUID(),
              transport: "cookie",
              user: { id, email: `${id}@chatbot-write.test`, emailVerified: true },
            },
          },
        }),
      );
    const executor = await executorFor(actorId);
    const otherExecutor = await executorFor(otherId);
    const execute = (name: string, input: object) => executor.execute({ name, input });
    const expectChatbotCode = async (run: Promise<unknown>, code: string) => {
      await assert.rejects(run, (error: unknown) => {
        assert.equal((error as { code?: string }).code, code);
        return true;
      });
    };
    const operationId = "a".repeat(32);
    const input = {
      conversation_id: conversationId,
      content: "lost acknowledgement",
      operation_id: operationId,
    };

    assert.deepEqual(await actor.messaging.sendMessage(input), { success: true });
    assert.deepEqual(await actor.messaging.sendMessage(input), { success: true });
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.messages where conversation_id=$1",
          [conversationId],
        )
      ).rows[0]?.count,
      1,
      "sequential lost-ack retry must replay, not insert",
    );

    const sdkMessageDescriptor = executor
      .listTools()
      .find((tool) => tool.id === "api.messaging.send-message");
    if (!sdkMessageDescriptor) throw new Error("Missing chatbot message descriptor");
    const sdkOperationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const sdkTools = createChatbotAiSdkTools({
      apiExecutor: executor,
      descriptors: [sdkMessageDescriptor],
      resolveOperationId: async () => sdkOperationId,
    });
    const sdkUsage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    };
    const runSdkMessage = () =>
      generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [
              {
                input: JSON.stringify({
                  conversation_id: conversationId,
                  content: "sdk adapter retry",
                }),
                toolCallId: "sdk-message-call",
                toolName: "api_messaging_send-message",
                type: "tool-call",
              },
            ],
            finishReason: { unified: "tool-calls", raw: undefined },
            usage: sdkUsage,
            warnings: [],
          }),
        }),
        prompt: "Send the message.",
        tools: sdkTools.tools,
      });
    assert.deepEqual(
      (await runSdkMessage()).toolResults.map((result) => result.output),
      [{ success: true }],
    );
    assert.deepEqual(
      (await runSdkMessage()).toolResults.map((result) => result.output),
      [{ success: true }],
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.messages where content='sdk adapter retry'",
        )
      ).rows[0]?.count,
      1,
      "SDK adapter retries must retain the stable host operation ID and create one message",
    );

    const concurrentOperationId = "b".repeat(32);
    await Promise.all(
      Array.from({ length: 2 }, () =>
        actor.messaging.sendMessage({
          conversation_id: conversationId,
          content: "concurrent duplicate",
          operation_id: concurrentOperationId,
        }),
      ),
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.messages where content='concurrent duplicate'",
        )
      ).rows[0]?.count,
      1,
      "concurrent duplicate must insert one message",
    );
    await expectCode(
      actor.messaging.sendMessage({ ...input, content: "changed arguments" }),
      "CONFLICT",
    );
    await expectCode(denied.messaging.sendMessage(input), "NOT_FOUND");

    await target.query(
      "delete from public.conversation_participants where conversation_id=$1 and user_id=$2",
      [conversationId, actorId],
    );
    await expectCode(actor.messaging.sendMessage(input), "NOT_FOUND");
    await target.query(
      "insert into public.conversation_participants(conversation_id,user_id) values ($1,$2)",
      [conversationId, actorId],
    );

    const activityPlanStructure = {
      version: 5 as const,
      activity_category: "bike" as const,
      items: [
        {
          type: "step" as const,
          id: "44444444-4444-4444-8444-444444444444",
          name: "Receipt Ride",
          duration: { type: "time" as const, seconds: 1800 },
          targets: [{ type: "%FTP" as const, intensity: 75 }],
        },
      ],
    };
    const createActivityPlanInput = {
      name: "Receipt activity plan",
      structure: activityPlanStructure,
      operationId: "d".repeat(32),
    };
    const [createdActivityPlan] = await Promise.all([
      actor.activityPlans.create(createActivityPlanInput),
      actor.activityPlans.create(createActivityPlanInput),
    ]);
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.activity_plans where profile_id=$1 and name='Receipt activity plan'",
          [actorId],
        )
      ).rows[0]?.count,
      1,
      "concurrent create retries must persist one activity plan",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.chatbot_operation_receipts where profile_id=$1 and operation_id=$2",
          [actorId, createActivityPlanInput.operationId],
        )
      ).rows[0]?.count,
      1,
    );

    const editOperationId = "e".repeat(32);
    const editInput = {
      id: createdActivityPlan.id,
      expectedStructureHash: createdActivityPlan.structure_hash,
      expectedRevision: createdActivityPlan.revision,
      name: "Receipt activity plan edited",
      operationId: editOperationId,
    };
    const editedActivityPlan = await actor.activityPlans.update(editInput);
    const replayedActivityPlan = await actor.activityPlans.update(editInput);
    assert.equal(
      replayedActivityPlan.revision,
      editedActivityPlan.revision,
      "edit replay keeps revision",
    );
    assert.deepEqual(
      replayedActivityPlan,
      editedActivityPlan,
      "edit replay returns the durable result",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.chatbot_operation_receipts where profile_id=$1 and operation_id=$2",
          [actorId, editOperationId],
        )
      ).rows[0]?.count,
      1,
      "edit replay must not enqueue a second durable operation",
    );
    await expectCode(
      actor.activityPlans.update({ ...editInput, name: "different edit" }),
      "CONFLICT",
    );

    await expectCode(denied.activityPlans.update(editInput), "NOT_FOUND");
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.chatbot_operation_receipts where profile_id=$1 and operation_id=$2",
          [deniedId, editOperationId],
        )
      ).rows[0]?.count,
      0,
      "a nonowner must not gain a receipt",
    );
    const staleOperationId = "f".repeat(32);
    await expectCode(
      actor.activityPlans.update({
        ...editInput,
        expectedRevision: editInput.expectedRevision + 1,
        operationId: staleOperationId,
      }),
      "CONFLICT",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.chatbot_operation_receipts where profile_id=$1 and operation_id=$2",
          [actorId, staleOperationId],
        )
      ).rows[0]?.count,
      0,
      "a stale edit must roll back its receipt",
    );

    const createScheduleInput = {
      profileId: actorId,
      operationId: randomUUID(),
      session: {
        planningDate: "2026-10-30",
        source: { kind: "direct" as const, operationId: randomUUID() },
        activityPlanId: createdActivityPlan.id,
      },
    };
    const [createdSchedule, replayedCreatedSchedule] = await Promise.all([
      actor.plannedSessions.create(createScheduleInput),
      actor.plannedSessions.create(createScheduleInput),
    ]);
    assert.deepEqual(
      replayedCreatedSchedule,
      createdSchedule,
      "schedule create replays its receipt",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.planned_sessions where profile_id=$1 and id=$2",
          [actorId, createdSchedule.session.id],
        )
      ).rows[0]?.count,
      1,
      "concurrent schedule create must persist one session",
    );

    const moveInput = {
      profileId: actorId,
      sessionId: createdSchedule.session.id,
      expectedRevision: createdSchedule.session.sessionRevision,
      planningDate: "2026-10-31",
      operationId: randomUUID(),
    };
    const movedSchedule = await actor.plannedSessions.move(moveInput);
    assert.deepEqual(
      await actor.plannedSessions.move(moveInput),
      movedSchedule,
      "schedule move retry must replay the original revision and result",
    );
    const cancelInput = {
      profileId: actorId,
      sessionId: createdSchedule.session.id,
      expectedRevision: movedSchedule.session.sessionRevision,
      operationId: randomUUID(),
    };
    const cancelledSchedule = await actor.plannedSessions.cancel(cancelInput);
    assert.deepEqual(
      await actor.plannedSessions.cancel(cancelInput),
      cancelledSchedule,
      "schedule cancel retry must replay the original revision and result",
    );
    const staleScheduleOperationId = randomUUID();
    await expectCode(
      actor.plannedSessions.move({
        ...moveInput,
        expectedRevision: movedSchedule.session.sessionRevision,
        operationId: staleScheduleOperationId,
      }),
      "CONFLICT",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.chatbot_operation_receipts where profile_id=$1 and operation_id=$2",
          [actorId, staleScheduleOperationId],
        )
      ).rows[0]?.count,
      0,
      "a stale schedule mutation must roll back its receipt",
    );
    await expectCode(denied.plannedSessions.move(moveInput), "FORBIDDEN");

    const diary = await actor.activities.createManualDiaryEntry({
      observation: {
        operationId: randomUUID(),
        diaryDate: "2026-10-29",
        diaryTimezone: "UTC",
        name: "Receipt diary",
        activityCategory: "run",
      },
    });
    const activityUpdateInput = {
      id: diary.activity.id,
      name: "Receipt diary edited",
      notes: "retry-safe metadata",
      operationId: randomUUID(),
    };
    const updatedActivity = await actor.activities.update(activityUpdateInput);
    assert.deepEqual(
      await actor.activities.update(activityUpdateInput),
      updatedActivity,
      "activity metadata retry must replay the Date-bearing stored result",
    );
    await expectCode(
      actor.activities.update({ ...activityUpdateInput, name: "conflicting metadata" }),
      "CONFLICT",
    );
    await expectCode(denied.activities.update(activityUpdateInput), "NOT_FOUND");
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.chatbot_operation_receipts where profile_id=$1 and operation_id=$2",
          [deniedId, activityUpdateInput.operationId],
        )
      ).rows[0]?.count,
      0,
      "a nonowner activity edit must not persist a receipt",
    );

    // The following journeys use the public chatbot executor, rather than a direct router
    // caller, so they prove tool lookup, input/output contracts, and trusted actor injection.
    const executorActivityPlanInput = {
      name: "Executor receipt activity plan",
      structure: activityPlanStructure,
      operationId: "executor_activity_plan_create_receipt_0001",
    };
    let executorActivityPlanFailure: string | null = null;
    try {
      const executorActivityPlan = (await execute(
        "api.activity-plans.create",
        executorActivityPlanInput,
      )) as { id: string; revision: number; structure_hash: string };
      assert.deepEqual(
        await execute("api.activity-plans.create", executorActivityPlanInput),
        executorActivityPlan,
        "executor activity-plan create must replay its parsed output",
      );
      await expectChatbotCode(
        execute("api.activity-plans.create", { ...executorActivityPlanInput, name: "conflicting" }),
        "conflict",
      );
      const executorActivityPlanEditInput = {
        id: executorActivityPlan.id,
        expectedRevision: executorActivityPlan.revision,
        expectedStructureHash: executorActivityPlan.structure_hash,
        name: "Executor receipt activity plan edited",
        operationId: "executor_activity_plan_update_receipt_0001",
      };
      const executorActivityPlanEdit = await execute(
        "api.activity-plans.update",
        executorActivityPlanEditInput,
      );
      assert.deepEqual(
        await execute("api.activity-plans.update", executorActivityPlanEditInput),
        executorActivityPlanEdit,
      );
      await expectChatbotCode(
        execute("api.messaging.send-message", {
          conversation_id: conversationId,
          content: "cross-command operation reuse",
          operationId: executorActivityPlanInput.operationId,
        }),
        "conflict",
      );
      assert.equal(
        (
          await target.query(
            "select count(*)::int as count from public.messages where content='cross-command operation reuse'",
          )
        ).rows[0]?.count,
        0,
        "a same-actor cross-command receipt conflict must not run the second mutation",
      );
      const otherActivityPlan = (await otherExecutor.execute({
        name: "api.activity-plans.create",
        input: { ...executorActivityPlanInput, name: "Other executor receipt activity plan" },
      })) as { id: string; revision: number; structure_hash: string };
      assert.notEqual(otherActivityPlan.id, executorActivityPlan.id);
      assert.equal(
        (
          await target.query(
            "select count(*)::int as count from public.chatbot_operation_receipts where operation_id=$1 and profile_id in ($2,$3)",
            [executorActivityPlanInput.operationId, actorId, otherId],
          )
        ).rows[0]?.count,
        2,
        "operation IDs must be isolated by actor profile",
      );
    } catch (error) {
      executorActivityPlanFailure = (error as { code?: string }).code ?? "unknown";
      console.error(
        `[api:chatbot-writes] executor tool api.activity-plans.create failed with ${executorActivityPlanFailure}; input and result intentionally omitted`,
      );
    }
    await expectChatbotCode(
      execute("api.activity-plans.create", {
        name: "missing operation ID",
        structure: activityPlanStructure,
      }),
      "invalid_tool_call",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.activity_plans where profile_id=$1 and name='missing operation ID'",
          [actorId],
        )
      ).rows[0]?.count,
      0,
      "a rejected executor call must fail before its write",
    );
    const executorScheduleInput = {
      operationId: randomUUID(),
      session: { planningDate: "2026-11-01", activityPlanId: createdActivityPlan.id },
    };
    let executorScheduleFailure: string | null = null;
    try {
      const executorSchedule = (await execute(
        "api.planned-sessions.create",
        executorScheduleInput,
      )) as {
        outcome: string;
        session: { id: string; sessionRevision: number; planningDate: string };
      };
      assert.deepEqual(
        await execute("api.planned-sessions.create", executorScheduleInput),
        executorSchedule,
        "executor schedule create must replay",
      );
      const executorMoveInput = {
        sessionId: executorSchedule.session.id,
        expectedRevision: executorSchedule.session.sessionRevision,
        planningDate: "2026-11-02",
        operationId: randomUUID(),
      };
      const executorMoved = (await execute("api.planned-sessions.move", executorMoveInput)) as {
        outcome: string;
        session: { id: string; sessionRevision: number; planningDate: string };
      };
      assert.deepEqual(
        await execute("api.planned-sessions.move", executorMoveInput),
        executorMoved,
      );
      const executorCancelInput = {
        sessionId: executorSchedule.session.id,
        expectedRevision: executorMoved.session.sessionRevision,
        operationId: randomUUID(),
      };
      const executorCancelled = await execute("api.planned-sessions.cancel", executorCancelInput);
      assert.deepEqual(
        await execute("api.planned-sessions.cancel", executorCancelInput),
        executorCancelled,
        "executor schedule cancel must replay",
      );
      assert.equal(
        (
          await target.query(
            "select count(*)::int as count from public.provider_sync_jobs where profile_id=$1",
            [actorId],
          )
        ).rows[0]?.count,
        0,
        "without integrations, executor scheduling must not enqueue provider work",
      );
    } catch (error) {
      executorScheduleFailure = (error as { code?: string }).code ?? "unknown";
      console.error(
        `[api:chatbot-writes] executor tool api.planned-sessions.create failed with ${executorScheduleFailure}; input and result intentionally omitted`,
      );
    }
    await expectChatbotCode(
      execute("api.planned-sessions.create", { ...executorScheduleInput, profileId: deniedId }),
      "invalid_tool_call",
    );

    const executorMessageInput = {
      conversation_id: conversationId,
      content: "executor sequential retry",
      operationId: "executor_message_retry_receipt_0001",
    };
    let executorMessageFailure: string | null = null;
    try {
      assert.deepEqual(await execute("api.messaging.send-message", executorMessageInput), {
        success: true,
      });
      assert.deepEqual(await execute("api.messaging.send-message", executorMessageInput), {
        success: true,
      });
      assert.equal(
        (
          await target.query(
            "select count(*)::int as count from public.messages where content='executor sequential retry'",
          )
        ).rows[0]?.count,
        1,
        "executor message retry must create one message",
      );
      await target.query(
        "delete from public.conversation_participants where conversation_id=$1 and user_id=$2",
        [conversationId, actorId],
      );
      await expectChatbotCode(
        execute("api.messaging.send-message", executorMessageInput),
        "not_found",
      );
    } catch (error) {
      executorMessageFailure = (error as { code?: string }).code ?? "unknown";
      console.error(
        `[api:chatbot-writes] executor tool api.messaging.send-message failed with ${executorMessageFailure}; input and result intentionally omitted`,
      );
    }

    const executorActivityUpdateInput = {
      id: diary.activity.id,
      name: "Executor completed activity edit",
      notes: "executor receipt replay",
      operationId: "executor_activity_update_receipt_0001",
    };
    let executorActivityUpdateFailure: string | null = null;
    try {
      const executorActivity = await execute("api.activities.update", executorActivityUpdateInput);
      assert.deepEqual(
        await execute("api.activities.update", executorActivityUpdateInput),
        executorActivity,
      );
    } catch (error) {
      executorActivityUpdateFailure = (error as { code?: string }).code ?? "unknown";
      console.error(
        `[api:chatbot-writes] executor tool api.activities.update failed with ${executorActivityUpdateFailure}; input and result intentionally omitted`,
      );
    }
    const executorDiaryInput = {
      observation: {
        operationId: randomUUID(),
        diaryDate: "2026-10-30",
        diaryTimezone: "UTC",
        name: "Executor manual diary",
        activityCategory: "run",
      },
    };
    const executorDiary = (await execute(
      "api.activities.create-manual-diary-entry",
      executorDiaryInput,
    )) as {
      outcome: "created" | "unchanged";
      activity: { id: string; name: string; diaryDate: string };
    };
    const replayedExecutorDiary = (await execute(
      "api.activities.create-manual-diary-entry",
      executorDiaryInput,
    )) as typeof executorDiary;
    assert.equal(executorDiary.outcome, "created");
    assert.equal(replayedExecutorDiary.outcome, "unchanged");
    assert.deepEqual(replayedExecutorDiary.activity, executorDiary.activity);

    await target.query(
      `insert into public.profile_athlete_state
       (profile_id,source_revision,published_revision,dirty_from_at,fitness,fatigue,evidence_confidence,coverage_start_at,coverage_end_at,last_activity_at,algorithm_version,computed_at,updated_at)
       values ($1,1,1,null,42,36,0.8,'2026-10-01T00:00:00.000Z','2026-10-29T12:00:00.000Z','2026-10-29T12:00:00.000Z','athlete-state-projection-v1','2026-10-29T12:00:00.000Z','2026-10-29T12:00:00.000Z')`,
      [actorId],
    );
    const trainingActivityPlan = await actor.activityPlans.create({
      name: "Executor training source",
      structure: {
        version: 5,
        activity_category: "run",
        items: [
          {
            type: "step",
            id: randomUUID(),
            name: "Easy training source",
            duration: { type: "time", seconds: 1800 },
            targets: [],
          },
        ],
      },
      operationId: "executor_training_source_direct_0001",
    });
    const trainingDraft = {
      name: "Executor training plan",
      description: null,
      structure: {
        version: 1,
        plan_preferences: {
          weekly_session_count: 1,
          target_weekly_duration_minutes: 30,
          maximum_session_duration_minutes: 30,
          preferred_weekdays: [1],
          rest_days: [],
          progression_style: "balanced",
          recovery_priority: "balanced",
        },
        sessions: [
          {
            id: randomUUID(),
            activity_plan_id: trainingActivityPlan.id,
            offset_days: 0,
            demand: {
              activity_category: "run",
              training_intent: "general_maintenance",
              target_duration_minutes: 30,
              target_common_load: null,
              importance: "normal",
            },
          },
        ],
      },
      previewStartDate: "2026-11-03",
    };
    const trainingPreview = (await execute("api.training-plans.preview", {
      kind: "create",
      draft: trainingDraft,
    })) as { status: string; basePublishedRevision: number | null; previewFingerprint: string };
    assert.equal(trainingPreview.status, "available", "training preview must be available");
    const trainingCommitInput = {
      kind: "create",
      draft: trainingDraft,
      operationId: "executor_training_commit_receipt_0001",
      basePublishedRevision: trainingPreview.basePublishedRevision,
      previewFingerprint: trainingPreview.previewFingerprint,
    };
    const trainingCommit = (await execute("api.training-plans.commit", trainingCommitInput)) as {
      status: string;
      planId: string;
    };
    assert.equal(trainingCommit.status, "saved");
    assert.deepEqual(
      await execute("api.training-plans.commit", trainingCommitInput),
      trainingCommit,
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.training_plans where profile_id=$1 and name='Executor training plan'",
          [actorId],
        )
      ).rows[0]?.count,
      1,
      "executor commit retry must persist one plan",
    );
    const applicationPreview = (await execute("api.training-plans.preview-application", {
      trainingPlanId: trainingCommit.planId,
      applicationMode: "full",
      startDate: "2026-11-03",
    })) as {
      status: string;
      planRevision: number;
      planHash: string;
      basePublishedRevision: number | null;
      previewFingerprint: string;
    };
    assert.equal(applicationPreview.status, "available", "application preview must be available");
    const applicationInput = {
      trainingPlanId: trainingCommit.planId,
      applicationMode: "full",
      startDate: "2026-11-03",
      operationId: "executor_training_apply_receipt_0001",
      expectedPlanRevision: applicationPreview.planRevision,
      expectedPlanHash: applicationPreview.planHash,
      basePublishedRevision: applicationPreview.basePublishedRevision,
      previewFingerprint: applicationPreview.previewFingerprint,
    };
    const application = await execute("api.training-plans.apply-application", applicationInput);
    assert.deepEqual(
      await execute("api.training-plans.apply-application", applicationInput),
      application,
      "executor application retry must replay",
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.training_plan_applications where profile_id=$1",
          [actorId],
        )
      ).rows[0]?.count,
      1,
      "executor application retry must persist one application",
    );
    const executorActivityPlanCountBeforeCorruption = (
      await target.query(
        "select count(*)::int as count from public.activity_plans where profile_id=$1 and name='Executor receipt activity plan'",
        [actorId],
      )
    ).rows[0]?.count;
    await target.query(
      "update public.chatbot_operation_receipts set result=$1::jsonb where profile_id=$2 and operation_id=$3",
      [JSON.stringify({ version: 999 }), actorId, executorActivityPlanInput.operationId],
    );
    await assert.rejects(
      execute("api.activity-plans.create", executorActivityPlanInput),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "internal_error");
        assert.doesNotMatch(String(error), /version|result|receipt/i);
        return true;
      },
    );
    assert.equal(
      (
        await target.query(
          "select count(*)::int as count from public.activity_plans where profile_id=$1 and name='Executor receipt activity plan'",
          [actorId],
        )
      ).rows[0]?.count,
      executorActivityPlanCountBeforeCorruption,
      "a corrupt receipt retry must not rerun the durable activity-plan creation",
    );
    const before = await target.query<{ messages: number; receipts: number }>(
      `select
        (select count(*)::int from public.messages where content='rollback fault') as messages,
        (select count(*)::int from public.chatbot_operation_receipts where operation_id=$1) as receipts`,
      ["c".repeat(32)],
    );
    await assert.rejects(
      client.db.transaction((tx) =>
        executeWithOperationReceipt({
          tx,
          actorId,
          operationId: "c".repeat(32),
          command: "chatbot.messaging.fault",
          semanticInput: { conversation_id: conversationId },
          output: z.object({ success: z.literal(true) }),
          authorize: async () => true,
          mutate: async (executor) => {
            await executor.execute(
              (await import("drizzle-orm"))
                .sql`insert into messages(conversation_id,sender_id,content) values (${conversationId},${actorId},'rollback fault')`,
            );
            throw new Error("fault after mutation");
          },
        }),
      ),
      /fault after mutation/,
    );
    const after = await target.query<{ messages: number; receipts: number }>(
      `select
        (select count(*)::int from public.messages where content='rollback fault') as messages,
        (select count(*)::int from public.chatbot_operation_receipts where operation_id=$1) as receipts`,
      ["c".repeat(32)],
    );
    assert.deepEqual(
      after.rows[0],
      before.rows[0],
      "fault rollback must retain neither message nor receipt",
    );
    if (
      executorActivityPlanFailure ||
      executorScheduleFailure ||
      executorMessageFailure ||
      executorActivityUpdateFailure
    )
      throw new Error(
        `executor acceptance blocked: api.activity-plans.create=${executorActivityPlanFailure ?? "ok"}, api.planned-sessions.create=${executorScheduleFailure ?? "ok"}, api.messaging.send-message=${executorMessageFailure ?? "ok"}, api.activities.update=${executorActivityUpdateFailure ?? "ok"} (input/result intentionally omitted)`,
      );
    console.info(
      "[api:chatbot-writes] message, activity-plan, and schedule replay, concurrency, conflict, authorization, and rollback passed",
    );
  } finally {
    await client.close();
  }
});
