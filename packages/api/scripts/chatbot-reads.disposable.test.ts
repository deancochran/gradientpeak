#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { activityPlanStructureHash } from "../src/application/activity-plans/structure-hash";

// @repo/db/client creates a module-level pool. This inert local value only permits
// importing server modules; the executable contexts below use the disposable URL.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.NEXT_PRIVATE_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY ??= "disposable-chatbot-storage-key";

const now = "2026-10-29T12:00:00.000Z";
const trainingStructure = (activityPlanId: string) => ({
  id: randomUUID(),
  version: 1,
  plan_preferences: {
    weekly_session_count: null,
    target_weekly_duration_minutes: null,
    maximum_session_duration_minutes: null,
    preferred_weekdays: [],
    rest_days: [],
    progression_style: null,
    recovery_priority: null,
  },
  sessions: [
    {
      id: randomUUID(),
      offset_days: 0,
      activity_plan_id: activityPlanId,
      demand: {
        activity_category: "run",
        training_intent: "general_maintenance",
        target_duration_minutes: 30,
        target_common_load: null,
        importance: "normal",
      },
    },
  ],
});
const trainingHash = `v1:sha256:${"0".repeat(64)}`;

async function expectChatbotError(run: Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

/**
 * Executes every currently allowlisted chatbot read through appRouter on a fresh,
 * harness-attested local PostgreSQL database. Fixture writes never target dev/E2E data.
 */
await withDisposableDatabase(process.argv.slice(2), "api_chatbot_reads", async (target, url) => {
  await bootstrapSupabaseSchemas(target);
  for (const migration of requireFreshBaseline().migrationPaths)
    await applySqlFile(target, migration);

  const actorId = randomUUID();
  const otherId = randomUUID();
  const ownActivityPlanId = randomUUID();
  const secondActivityPlanId = randomUUID();
  const privateOtherActivityPlanId = randomUUID();
  const ownTrainingPlanId = randomUUID();
  const secondTrainingPlanId = randomUUID();
  const otherTrainingPlanId = randomUUID();
  const goalId = randomUUID();
  const otherGoalId = randomUUID();
  const sessionId = randomUUID();
  const otherSessionId = randomUUID();
  const structure = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: randomUUID(),
        name: "Easy",
        duration: { type: "time", seconds: 60 },
        targets: [],
      },
    ],
  });
  const semanticHash = activityPlanSemanticHash({
    structure,
    trainingIntent: "general_maintenance",
  });
  const insertProfile = async (id: string, label: string) => {
    await target.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,'{}')", [
      id,
      `${id}@chatbot-read.test`,
    ]);
    await target.query(
      `insert into public.profiles(id,email,full_name,username,language,preferred_units,onboarding_status,is_public,planning_timezone)
       values ($1,$2,$3,$4,'en','metric','completed',false,'UTC')
       on conflict (id) do update set email=excluded.email,full_name=excluded.full_name,username=excluded.username,
         language=excluded.language,preferred_units=excluded.preferred_units,onboarding_status=excluded.onboarding_status,
         is_public=excluded.is_public,planning_timezone=excluded.planning_timezone`,
      [id, `${id}@chatbot-read.test`, label, `chatbot-${id.slice(0, 8)}`],
    );
  };
  await insertProfile(actorId, "Chatbot Actor");
  await insertProfile(otherId, "Chatbot Other");
  for (const [id, profileId, name] of [
    [ownActivityPlanId, actorId, "Own chatbot plan"],
    [secondActivityPlanId, actorId, "Older own chatbot plan"],
    [privateOtherActivityPlanId, otherId, "Other private chatbot plan"],
  ] as const) {
    await target.query(
      `insert into public.activity_plans
       (id,profile_id,name,structure,structure_hash,semantic_hash,training_intent,content_visibility,created_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,'general_maintenance','private',$7,$7)`,
      [
        id,
        profileId,
        name,
        JSON.stringify(structure),
        activityPlanStructureHash(structure),
        semanticHash,
        id === ownActivityPlanId ? now : "2026-10-28T12:00:00.000Z",
      ],
    );
  }
  for (const [id, profileId, name] of [
    [ownTrainingPlanId, actorId, "Own chatbot training"],
    [secondTrainingPlanId, actorId, "Older own chatbot training"],
    [otherTrainingPlanId, otherId, "Other private training"],
  ] as const) {
    await target.query(
      `insert into public.training_plans
       (id,profile_id,name,description,structure,structure_hash,content_visibility,created_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,'private',$7,$7)`,
      [
        id,
        profileId,
        name,
        `${name} description`,
        JSON.stringify(trainingStructure(ownActivityPlanId)),
        trainingHash,
        id === ownTrainingPlanId ? now : "2026-10-28T12:00:00.000Z",
      ],
    );
  }
  for (const [name, createdAt] of [
    ["Literal % training", "2026-10-27T12:00:00.000Z"],
    ["Literal _ training", "2026-10-26T12:00:00.000Z"],
    ["Literal \\ training", "2026-10-25T12:00:00.000Z"],
    ["Literal ordinary training", "2026-10-24T12:00:00.000Z"],
  ] as const) {
    await target.query(
      `insert into public.training_plans
       (id,profile_id,name,description,structure,structure_hash,content_visibility,created_at,updated_at)
       values ($1,$2,$3,null,$4,$5,'private',$6,$6)`,
      [
        randomUUID(),
        actorId,
        name,
        JSON.stringify(trainingStructure(ownActivityPlanId)),
        trainingHash,
        createdAt,
      ],
    );
  }
  await target.query(
    `insert into public.profile_goals
     (id,profile_id,title,priority,activity_category,target_date,target_payload,created_at,updated_at)
     values ($1,$2,'Chatbot goal',3,'run','2026-10-30',$3,$4,$4)`,
    [
      goalId,
      actorId,
      JSON.stringify({ type: "completion", activity_category: "run", distance_m: 5000 }),
      now,
    ],
  );
  await target.query(
    `insert into public.profile_goals
     (id,profile_id,title,priority,activity_category,target_date,target_payload,created_at,updated_at)
     values ($1,$2,'Other chatbot goal',3,'run','2026-10-30',$3,$4,$4)`,
    [
      otherGoalId,
      otherId,
      JSON.stringify({ type: "completion", activity_category: "run", distance_m: 5000 }),
      now,
    ],
  );
  const directOperationId = "a".repeat(32);
  await target.query(
    `insert into public.planned_sessions
     (id,profile_id,planning_date,original_target_date,source_kind,idempotency_key,direct_operation_id,activity_plan_id,status)
     values ($1,$2,'2026-10-29','2026-10-29','direct',$3,$4,$5,'scheduled')`,
    [sessionId, actorId, `direct:${directOperationId}`, directOperationId, ownActivityPlanId],
  );
  await target.query(
    `insert into public.planned_sessions
     (id,profile_id,planning_date,original_target_date,source_kind,idempotency_key,direct_operation_id,activity_plan_id,status)
     values ($1,$2,'2026-10-29','2026-10-29','direct',$3,$4,$5,'scheduled')`,
    [
      otherSessionId,
      otherId,
      `direct:${"d".repeat(32)}`,
      "d".repeat(32),
      privateOtherActivityPlanId,
    ],
  );
  await target.query(
    `insert into public.notifications(id,user_id,actor_id,type,read_at,created_at)
     values ($1,$2,$2,'new_message',null,$3), ($4,$5,$5,'new_message',null,$3)`,
    [randomUUID(), actorId, now, randomUUID(), otherId],
  );
  for (const [date, operation] of [
    ["2026-10-28", "b".repeat(32)],
    ["2026-10-30", "c".repeat(32)],
  ] as const) {
    await target.query(
      `insert into public.planned_sessions
       (id,profile_id,planning_date,original_target_date,source_kind,idempotency_key,direct_operation_id,activity_plan_id,status)
       values ($1,$2,$3,$3,'direct',$4,$5,$6,'scheduled')`,
      [randomUUID(), actorId, date, `direct:${operation}`, operation, ownActivityPlanId],
    );
  }

  const [
    { createDbClient },
    { createApiContext },
    { createChatbotApiExecutor },
    { Pool },
    { drizzle },
    { relationalSchema },
    { createTrainingPlanRepository },
  ] = await Promise.all([
    import("@repo/db/client"),
    import("../src/context"),
    import("../src/chatbot"),
    import("pg"),
    import("drizzle-orm/node-postgres"),
    import("@repo/db/schema"),
    import("../src/infrastructure/repositories/drizzle-training-plan-repository"),
  ]);
  const client = createDbClient({ url });
  try {
    const makeExecutor = async (id: string) =>
      createChatbotApiExecutor(
        await createApiContext({
          db: client.db,
          headers: new Headers(),
          auth: {
            session: {
              sessionId: randomUUID(),
              transport: "cookie",
              user: { id, email: `${id}@chatbot-read.test`, emailVerified: true },
            },
          },
        }),
      );
    const actor = await makeExecutor(actorId);
    const other = await makeExecutor(otherId);
    const call = async (name: string, input: object = {}) => {
      const result = await actor.execute({ name, input });
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result, `${name} must return JSON`);
      return result;
    };

    assert.equal(await call("api.notifications.get-unread-count"), 1);
    const ownPlans = (await call("api.activity-plans.list-own", { limit: 1 })) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    assert.deepEqual(
      ownPlans.items.map((item) => item.id),
      [ownActivityPlanId],
    );
    assert.match(ownPlans.nextCursor ?? "", /^2026-10-29T12:00:00\.000Z_/);
    const secondOwnPlans = (await call("api.activity-plans.list-own", {
      cursor: ownPlans.nextCursor ?? undefined,
      direction: "forward",
      limit: 1,
    })) as { items: Array<{ id: string }>; nextCursor: string | null };
    assert.deepEqual(
      secondOwnPlans.items.map((item) => item.id),
      [secondActivityPlanId],
    );
    assert.equal(
      secondOwnPlans.nextCursor,
      null,
      "activity-plan paging must exhaust without decoys",
    );
    assert.deepEqual(await call("api.activity-plans.get-summary", { id: ownActivityPlanId }), {
      id: ownActivityPlanId,
      name: "Own chatbot plan",
      category: "run",
      revision: 1,
      structureHash: activityPlanStructureHash(structure),
    });
    await expectChatbotError(
      other.execute({ name: "api.activity-plans.get-summary", input: { id: ownActivityPlanId } }),
      "not_found",
    );
    const trainingPlans = (await call("api.training-plans.list-own", { limit: 1 })) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    assert.deepEqual(
      trainingPlans.items.map((item) => item.id),
      [ownTrainingPlanId],
    );
    assert.equal(trainingPlans.nextCursor, "index:1");
    const secondTrainingPlans = (await call("api.training-plans.list-own", {
      cursor: trainingPlans.nextCursor ?? undefined,
      direction: "forward",
      limit: 1,
    })) as { items: Array<{ id: string }>; nextCursor: string | null };
    assert.deepEqual(
      secondTrainingPlans.items.map((item) => item.id),
      [secondTrainingPlanId],
    );
    assert.equal(secondTrainingPlans.nextCursor, "index:2");
    const allTrainingPlans = (await call("api.training-plans.list-own", {
      cursor: secondTrainingPlans.nextCursor ?? undefined,
      direction: "forward",
      limit: 20,
    })) as { items: Array<{ id: string }>; nextCursor: string | null };
    assert.ok(!allTrainingPlans.items.some((item) => item.id === otherTrainingPlanId));
    assert.deepEqual(await call("api.training-plans.get-summary", { id: ownTrainingPlanId }), {
      id: ownTrainingPlanId,
      name: "Own chatbot training",
      description: "Own chatbot training description",
      revision: 1,
      structureHash: trainingHash,
    });
    await expectChatbotError(
      actor.execute({ name: "api.training-plans.get-summary", input: { id: otherTrainingPlanId } }),
      "not_found",
    );
    const activities = (await call("api.activities.list-recent-own", { limit: 1 })) as {
      items: Array<{ id: string; name: string }>;
      nextCursor: string | null;
    };
    assert.deepEqual(activities, { items: [], nextCursor: null });
    const goals = (await call("api.goals.list-own", { limit: 1 })) as {
      items: Array<{ id: string; targetDate: string }>;
    };
    assert.deepEqual(
      goals.items.map((item) => item.id),
      [goalId],
    );
    assert.equal(goals.items[0]?.targetDate, "2026-10-30");
    assert.ok(!goals.items.some((item) => item.id === otherGoalId));
    const sessions = (await call("api.planned-sessions.range-own", {
      startDate: "2026-10-29",
      endDate: "2026-10-29",
    })) as { items: Array<{ id: string; planningDate: string }>; truncated: boolean };
    assert.deepEqual(sessions, {
      items: [
        {
          id: sessionId,
          planningDate: "2026-10-29",
          activityPlanId: ownActivityPlanId,
          status: "scheduled",
        },
      ],
      truncated: false,
    });
    assert.ok(!sessions.items.some((item) => item.id === otherSessionId));
    const ninetyDayRange = (await call("api.planned-sessions.range-own", {
      startDate: "2026-10-01",
      endDate: "2026-12-29",
    })) as { items: Array<{ id: string; planningDate: string }> };
    assert.ok(ninetyDayRange.items.some((item) => item.id === sessionId));
    assert.deepEqual(await call("api.profiles.get-own-basic"), {
      id: actorId,
      fullName: "Chatbot Actor",
      username: `chatbot-${actorId.slice(0, 8)}`,
      preferredUnits: "metric",
      language: "en",
    });
    await expectChatbotError(
      actor.execute({ name: "api.profiles.get-own-basic", input: { actorProfileId: otherId } }),
      "invalid_tool_call",
    );
    const searchRepository = createTrainingPlanRepository(client.db);
    for (const [search, expectedName] of [
      ["%", "Literal % training"],
      ["_", "Literal _ training"],
      ["\\", "Literal \\ training"],
    ] as const) {
      const result = await searchRepository.listTrainingPlansPage({
        limit: 20,
        offset: 0,
        ownerScope: "own",
        profileId: actorId,
        search,
      });
      assert.deepEqual(
        result.items.map((item) => item.name),
        [expectedName],
      );
      assert.equal(result.total, 1);
    }
    const emptySearch = await searchRepository.listTrainingPlansPage({
      limit: 20,
      offset: 0,
      ownerScope: "own",
      profileId: actorId,
      search: "no matching chatbot plan",
    });
    assert.deepEqual(emptySearch, { items: [], total: 0 });
    for (const input of [
      { startDate: "2026-10-30", endDate: "2026-10-29" },
      { startDate: "2026-10-01", endDate: "2026-12-30" },
      { startDate: "not-a-date", endDate: "2026-10-29" },
    ]) {
      await expectChatbotError(
        actor.execute({ name: "api.planned-sessions.range-own", input }),
        "invalid_tool_call",
      );
    }

    // Instrument the actual repository transaction: delay only the count query until the
    // page query has completed and an independently pooled writer has committed.
    const concurrentPlanId = randomUUID();
    const readPool = new Pool({ connectionString: url, max: 1 });
    const writerPool = new Pool({ connectionString: url, max: 1 });
    const originalConnect = readPool.connect.bind(readPool);
    let releasePage!: () => void;
    let releaseCount!: () => void;
    let releaseCountIntercepted!: () => void;
    const pageCompleted = new Promise<void>((resolve) => (releasePage = resolve));
    const writerCompleted = new Promise<void>((resolve) => (releaseCount = resolve));
    const countInterceptedBarrier = new Promise<void>(
      (resolve) => (releaseCountIntercepted = resolve),
    );
    let pageStarted = false;
    let countIntercepted = false;
    let writerCommitted = false;
    const queryEvents: string[] = [];
    const withTimeout = <T>(promise: Promise<T>, message: string) =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), 5_000);
        promise.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });
    // biome-ignore lint/suspicious/noExplicitAny: pg overloads are preserved at runtime.
    (readPool as any).connect = async () => {
      const connection = await originalConnect();
      // biome-ignore lint/suspicious/noExplicitAny: forwards pg's runtime overloads unchanged.
      const originalQuery: (...queryArgs: any[]) => Promise<unknown> =
        connection.query.bind(connection);
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle calls promise-form queries only.
      (connection as any).query = async (...args: any[]) => {
        const request = args[0] as string | { text?: string };
        const text = (typeof request === "string" ? request : (request.text ?? "")).toLowerCase();
        const trainingPlanSelect = text.includes('from "training_plans"');
        if (trainingPlanSelect && !text.includes("count(")) {
          pageStarted = true;
          queryEvents.push("page-started");
          const result = await originalQuery(...args);
          queryEvents.push("page-completed");
          releasePage();
          return result;
        }
        if (trainingPlanSelect && text.includes("count(") && pageStarted) {
          countIntercepted = true;
          queryEvents.push("count-intercepted");
          releaseCountIntercepted();
          await writerCompleted;
          assert.equal(writerCommitted, true, "count query must wait for writer COMMIT");
          queryEvents.push("count-released");
        }
        return originalQuery(...args);
      };
      return connection;
    };
    try {
      const instrumentedDb = drizzle({
        client: readPool,
        schema: relationalSchema,
        casing: "snake_case",
      });
      const repository = createTrainingPlanRepository(instrumentedDb);
      const page = repository.listTrainingPlansPage({
        limit: 1,
        offset: 0,
        ownerScope: "own",
        profileId: actorId,
      });
      await withTimeout(pageCompleted, "repository page SELECT did not reach barrier");
      await withTimeout(countInterceptedBarrier, "repository count SELECT did not reach barrier");
      await writerPool.query("delete from public.training_plans where id=$1", [
        otherTrainingPlanId,
      ]);
      await writerPool.query(
        `insert into public.training_plans (id,profile_id,name,description,structure,structure_hash,content_visibility,created_at,updated_at)
         values ($1,$2,'Concurrent plan',null,$3,$4,'private',$5,$5)`,
        [
          concurrentPlanId,
          actorId,
          JSON.stringify(trainingStructure(ownActivityPlanId)),
          trainingHash,
          now,
        ],
      );
      writerCommitted = true;
      queryEvents.push("writer-committed");
      releaseCount();
      const snapshot = await withTimeout(page, "repository count SELECT did not complete");
      assert.equal(countIntercepted, true, "the count query must have been intercepted and gated");
      assert.ok(
        queryEvents.indexOf("count-intercepted") < queryEvents.indexOf("writer-committed") &&
          queryEvents.indexOf("writer-committed") < queryEvents.indexOf("count-released"),
        `unexpected repository query ordering: ${queryEvents.join(", ")}`,
      );
      assert.deepEqual(
        snapshot.items.map((item) => item.id),
        [ownTrainingPlanId],
      );
      assert.equal(snapshot.total, 6);
      const current = await target.query<{ actor_count: string; other_count: string }>(
        `select
           (select count(*)::text from public.training_plans where profile_id=$1) actor_count,
           (select count(*)::text from public.training_plans where profile_id=$2) other_count`,
        [actorId, otherId],
      );
      assert.deepEqual(current.rows[0], { actor_count: "7", other_count: "0" });
    } finally {
      releaseCount();
      // biome-ignore lint/suspicious/noExplicitAny: restores the overloaded pool method.
      (readPool as any).connect = originalConnect;
      await Promise.all([readPool.end(), writerPool.end()]);
    }
    console.info(
      "[api:chatbot-reads] 9 live chatbot reads, ownership, input injection, range, JSON, and snapshot assertions passed",
    );
  } finally {
    await client.close();
  }
});
