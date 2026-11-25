import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { Pool } from "pg";
import { bootstrapSupabaseSchemas, withDisposableDatabase } from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import { structureHash } from "./canonical-json";
import {
  applyCoachingCompletionReviewUpgrade,
  assertPrerequisiteArtifact,
  assertPreviewTarget,
  assertUpgradeArtifact,
  expectedPrerequisiteFingerprint,
  expectedUpgradeSql,
  prerequisiteBaseline,
  verifyRecoveryArchive,
} from "./coaching-completion-review-upgrade";

async function main() {
  assertPrerequisiteArtifact(expectedPrerequisiteFingerprint());
  assert.throws(
    () => assertPrerequisiteArtifact({ ...expectedPrerequisiteFingerprint(), tables: [] }),
    /differs from pinned source/,
  );
  assertUpgradeArtifact(expectedUpgradeSql());
  assertPreviewTarget("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  for (const target of [
    "postgresql://postgres:postgres@localhost:54322/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres#fragment",
  ])
    assert.throws(() => assertPreviewTarget(target), /non-literal preview target/);
  assert.throws(
    () => assertUpgradeArtifact(`${expectedUpgradeSql()}-- tampered\n`),
    /differs from bounded authoritative source/,
  );
  const temporary = mkdtempSync(join(tmpdir(), "coaching-completion-review-upgrade-"));
  try {
    const archive = join(temporary, "database.dump");
    const bytes = Buffer.from("PGDMP synthetic test");
    const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
    const fingerprint = JSON.parse(
      readFileSync(
        resolve(
          dbPackageRoot,
          "supabase/approved-upgrades/coaching-completion-review/before-fingerprint.json",
        ),
        "utf8",
      ),
    );
    const manifest = {
      target: "127.0.0.1:54322/postgres",
      createdAt: new Date().toISOString(),
      archiveSha256: hash(bytes),
      beforeFingerprintSha256: hash(JSON.stringify(fingerprint)),
    };
    writeFileSync(archive, bytes, { mode: 0o600 });
    writeFileSync(`${archive}.manifest.json`, JSON.stringify(manifest), { mode: 0o600 });
    verifyRecoveryArchive(archive);
    writeFileSync(`${archive}.manifest.json`, JSON.stringify({ ...manifest, target: "other" }));
    assert.throws(() => verifyRecoveryArchive(archive), /manifest/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  await withDisposableDatabase(
    process.argv.slice(2),
    "coaching_completion_review_upgrade",
    async (pool, connectionString) => {
      await bootstrapSupabaseSchemas(pool);
      await pool.query(prerequisiteBaseline());
      const sentinel = "00000000-0000-4000-8000-000000999999";
      await pool.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'completion-review-sentinel@example.test','{}'::jsonb)",
        [sentinel],
      );
      const beforeRows = await pool.query(
        "select to_jsonb(p) as row from public.profiles p where id=$1",
        [sentinel],
      );
      assert.equal(beforeRows.rowCount, 1);
      await pool.query(
        "create table public.coaching_completion_review_upgrade_unexpected(id integer)",
      );
      await assert.rejects(
        () => applyCoachingCompletionReviewUpgrade(pool),
        /pre-upgrade fingerprint mismatch/,
      );
      assert.equal(
        (await pool.query("select to_regclass('public.coaching_completion_reviews') as relation"))
          .rows[0].relation,
        null,
      );
      await pool.query("drop table public.coaching_completion_review_upgrade_unexpected");
      const afterPath = resolve(
        dbPackageRoot,
        "supabase/approved-upgrades/coaching-completion-review/after-fingerprint.json",
      );
      const expectedAfterFingerprint = readFileSync(afterPath, "utf8");
      try {
        writeFileSync(afterPath, JSON.stringify({ tampered: true }));
        await assert.rejects(
          () => applyCoachingCompletionReviewUpgrade(pool),
          /post-upgrade fingerprint mismatch/,
        );
        assert.equal(
          (await pool.query("select to_regclass('public.coaching_completion_reviews') as relation"))
            .rows[0]?.relation,
          null,
          "wrong postcondition must roll back the created relation",
        );
      } finally {
        writeFileSync(afterPath, expectedAfterFingerprint);
      }
      await applyCoachingCompletionReviewUpgrade(pool);
      const afterRows = await pool.query(
        "select to_jsonb(p) as row from public.profiles p where id=$1",
        [sentinel],
      );
      assert.deepEqual(afterRows.rows, beforeRows.rows, "existing profile changed during upgrade");

      const ids = {
        owner: "10000000-0000-4000-8000-000000000101",
        coach: "10000000-0000-4000-8000-000000000102",
        athlete: "10000000-0000-4000-8000-000000000103",
        otherAthlete: "10000000-0000-4000-8000-000000000104",
        org: "20000000-0000-4000-8000-000000000101",
        ownerMembership: "30000000-0000-4000-8000-000000000101",
        coachMembership: "30000000-0000-4000-8000-000000000102",
        engagement: "40000000-0000-4000-8000-000000000101",
        assignment: "50000000-0000-4000-8000-000000000101",
        group: "50000000-0000-4000-8000-000000000102",
        groupAthlete: "50000000-0000-4000-8000-000000000103",
        groupCoachAssignment: "50000000-0000-4000-8000-000000000104",
        activity: "60000000-0000-4000-8000-000000000101",
        replacementActivity: "60000000-0000-4000-8000-000000000102",
        otherActivity: "60000000-0000-4000-8000-000000000103",
        plan: "70000000-0000-4000-8000-000000000101",
        session: "80000000-0000-4000-8000-000000000101",
      };
      await pool.query(
        "insert into auth.users(id,email,raw_user_meta_data) values ($1,'owner@example.test','{}'),($2,'coach@example.test','{}'),($3,'athlete@example.test','{}'),($4,'other@example.test','{}')",
        [ids.owner, ids.coach, ids.athlete, ids.otherAthlete],
      );
      await pool.query("begin");
      await pool.query(
        "insert into public.organizations(id,created_by_profile_id,root_owner_membership_id,name,slug,timezone) values ($1,$2,$3,'Review test','review-test','UTC')",
        [ids.org, ids.owner, ids.ownerMembership],
      );
      await pool.query(
        "insert into public.organization_memberships(id,organization_id,profile_id) values ($1,$2,$3),($4,$2,$5)",
        [ids.ownerMembership, ids.org, ids.owner, ids.coachMembership, ids.coach],
      );
      await pool.query(
        "insert into public.organization_membership_role_grants(organization_id,membership_id,role_key) values ($1,$2,'admin'),($1,$3,'coach')",
        [ids.org, ids.ownerMembership, ids.coachMembership],
      );
      await pool.query("commit");
      await pool.query(
        "insert into public.coaching_engagements(id,organization_id,athlete_profile_id) values ($1,$2,$3)",
        [ids.engagement, ids.org, ids.athlete],
      );
      await pool.query(
        "insert into public.coaching_assignments(id,organization_id,engagement_id,coach_membership_id,assignment_kind) values ($1,$2,$3,$4,'primary')",
        [ids.assignment, ids.org, ids.engagement, ids.coachMembership],
      );
      for (const scope of ["activities", "calendar"]) {
        const policy =
          scope === "activities"
            ? "90000000-0000-4000-8000-000000000101"
            : "90000000-0000-4000-8000-000000000102";
        await pool.query(
          "insert into public.athlete_consent_policy_versions(id,scope_key,effective_from,jurisdiction,terms_text,content_digest) values ($1,$2,now()-interval '1 second','US',$2,$3)",
          [policy, scope, `sha256:${"a".repeat(64)}`],
        );
        await pool.query(
          "insert into public.athlete_data_sharing_consents(organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id) values ($1,$2,$3,$4,$5,$3)",
          [ids.org, ids.engagement, ids.athlete, scope, policy],
        );
      }
      const structure = activityPlanStructureSchema.parse({
        version: 5,
        activity_category: "run",
        items: [
          {
            type: "step",
            id: "10000000-0000-4000-8000-000000000201",
            duration: { type: "time", seconds: 60 },
            targets: [{ type: "RPE", intensity: 4 }],
          },
        ],
      });
      const structureHashValue = structureHash(structure);
      await pool.query(
        "insert into public.activity_plans(id,profile_id,name,training_intent,structure,structure_hash,semantic_hash) values ($1,$2,'Review plan','general_maintenance',$3,$4,$5)",
        [
          ids.plan,
          ids.athlete,
          JSON.stringify(structure),
          structureHashValue,
          activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" }),
        ],
      );
      await pool.query("begin");
      await pool.query(
        "insert into public.activities(id,profile_id,name,started_at,finished_at,elapsed_ms,active_ms,moving_ms,timing_coverage,parser_version,decoded_contract_version,materializer_version) values ($1,$4,'completed',now()-interval '1 minute',now(),60000,60000,60000,'complete','fixture','fixture','fixture'),($2,$4,'replacement',now()-interval '1 minute',now(),60000,60000,60000,'complete','fixture','fixture','fixture'),($3,$5,'other',now()-interval '1 minute',now(),60000,60000,60000,'complete','fixture','fixture','fixture')",
        [ids.activity, ids.replacementActivity, ids.otherActivity, ids.athlete, ids.otherAthlete],
      );
      await pool.query(
        "insert into public.activity_segments(id,activity_id,profile_id,ordinal,role,activity_category,start_offset_ms,end_offset_ms,summary,timing_coverage,active_ms,moving_ms,parser_version,materializer_version) values ('60000000-0000-4000-8000-000000000201',$1,$4,0,'activity','run',0,60000,'{\"version\":\"1\",\"timing\":{\"timingCoverage\":\"complete\",\"activeMs\":60000,\"movingMs\":60000}}','complete',60000,60000,'fixture','fixture'),('60000000-0000-4000-8000-000000000202',$2,$4,0,'activity','run',0,60000,'{\"version\":\"1\",\"timing\":{\"timingCoverage\":\"complete\",\"activeMs\":60000,\"movingMs\":60000}}','complete',60000,60000,'fixture','fixture'),('60000000-0000-4000-8000-000000000203',$3,$5,0,'activity','run',0,60000,'{\"version\":\"1\",\"timing\":{\"timingCoverage\":\"complete\",\"activeMs\":60000,\"movingMs\":60000}}','complete',60000,60000,'fixture','fixture')",
        [ids.activity, ids.replacementActivity, ids.otherActivity, ids.athlete, ids.otherAthlete],
      );
      await pool.query("commit");
      await pool.query(
        "insert into public.planned_sessions(id,profile_id,planning_date,original_target_date,source_kind,idempotency_key,direct_operation_id,activity_plan_id,status,completed_activity_id,completion_state,linked_at) values ($1,$2,current_date,current_date,'direct','direct:review-test-operation-000000000001','review-test-operation-000000000001',$3,'completed',$4,'linked',now())",
        [ids.session, ids.athlete, ids.plan, ids.activity],
      );
      const reviewValues = [
        ids.org,
        ids.engagement,
        ids.athlete,
        ids.session,
        ids.activity,
        "review-v1",
        ids.coach,
        ids.coachMembership,
        "direct",
        ids.assignment,
      ];
      const insertReview = (values = reviewValues) =>
        pool.query(
          "insert into public.coaching_completion_reviews(organization_id,engagement_id,athlete_profile_id,session_id,activity_id,evidence_version,reviewed_by_profile_id,reviewed_by_membership_id,review_authority_kind,reviewed_by_assignment_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          values,
        );
      await assert.rejects(
        () =>
          insertReview([
            ...reviewValues.slice(0, 4),
            ids.replacementActivity,
            ...reviewValues.slice(5),
          ]),
        /currently linked/,
      );
      await assert.rejects(
        () =>
          insertReview([...reviewValues.slice(0, 4), ids.otherActivity, ...reviewValues.slice(5)]),
        /currently linked/,
      );
      await pool.query("update public.planned_sessions set completed_activity_id=$1 where id=$2", [
        ids.replacementActivity,
        ids.session,
      ]);
      await assert.rejects(() => insertReview(), /currently linked/);
      await insertReview([
        ...reviewValues.slice(0, 4),
        ids.replacementActivity,
        ...reviewValues.slice(5),
      ]);
      await assert.rejects(
        () =>
          insertReview([
            ...reviewValues.slice(0, 4),
            ids.replacementActivity,
            ...reviewValues.slice(5),
          ]),
        /duplicate key/,
      );
      await pool.query("update public.planned_sessions set completed_activity_id=$1 where id=$2", [
        ids.activity,
        ids.session,
      ]);
      const retainedReview = await pool.query(
        "select count(*)::int as count from public.coaching_completion_reviews where session_id=$1",
        [ids.session],
      );
      assert.equal(retainedReview.rows[0]?.count, 1, "review history must survive a later relink");
      await pool.query(
        "insert into public.organization_groups(id,organization_id,name,created_by_membership_id) values($1,$2,'Review group',$3)",
        [ids.group, ids.org, ids.ownerMembership],
      );
      await pool.query(
        "insert into public.organization_group_athletes(id,organization_id,group_id,engagement_id,added_by_membership_id) values($1,$2,$3,$4,$5)",
        [ids.groupAthlete, ids.org, ids.group, ids.engagement, ids.ownerMembership],
      );
      await pool.query(
        "insert into public.organization_group_coach_assignments(id,organization_id,group_id,coach_membership_id,assigned_by_membership_id) values($1,$2,$3,$4,$5)",
        [ids.groupCoachAssignment, ids.org, ids.group, ids.coachMembership, ids.ownerMembership],
      );
      await pool.query(
        "insert into public.coaching_completion_reviews(organization_id,engagement_id,athlete_profile_id,session_id,activity_id,evidence_version,reviewed_by_profile_id,reviewed_by_membership_id,review_authority_kind,reviewed_by_group_coach_assignment_id,reviewed_by_group_athlete_membership_id) values($1,$2,$3,$4,$5,'review-group-v1',$6,$7,'group',$8,$9)",
        [
          ids.org,
          ids.engagement,
          ids.athlete,
          ids.session,
          ids.activity,
          ids.coach,
          ids.coachMembership,
          ids.groupCoachAssignment,
          ids.groupAthlete,
        ],
      );
      await pool.query(
        "update public.organization_group_coach_assignments set ended_at=now(), ended_by_membership_id=$1 where id=$2",
        [ids.ownerMembership, ids.groupCoachAssignment],
      );
      await assert.rejects(
        () =>
          pool.query(
            "insert into public.coaching_completion_reviews(organization_id,engagement_id,athlete_profile_id,session_id,activity_id,evidence_version,reviewed_by_profile_id,reviewed_by_membership_id,review_authority_kind,reviewed_by_group_coach_assignment_id,reviewed_by_group_athlete_membership_id) values($1,$2,$3,$4,$5,'review-group-revoked',$6,$7,'group',$8,$9)",
            [
              ids.org,
              ids.engagement,
              ids.athlete,
              ids.session,
              ids.activity,
              ids.coach,
              ids.coachMembership,
              ids.groupCoachAssignment,
              ids.groupAthlete,
            ],
          ),
        /active assigned coach/,
      );
      // A service-role insert must not acknowledge a group fact that was
      // revoked after the insert began but before it acquired the common
      // organization fence.  The lifecycle transaction deliberately holds the
      // organization row first, matching the production writer protocol.
      const racePool = new Pool({ connectionString, max: 3 });
      try {
        for (const revocation of ["coach_assignment", "athlete_membership", "archive"] as const) {
          const groupId = randomUUID();
          const groupAthleteId = randomUUID();
          const groupCoachId = randomUUID();
          const evidenceVersion = `review-race-${revocation}`;
          await pool.query(
            "insert into public.organization_groups(id,organization_id,name,created_by_membership_id) values($1,$2,$3,$4)",
            [groupId, ids.org, `Race ${revocation}`, ids.ownerMembership],
          );
          await pool.query(
            "insert into public.organization_group_athletes(id,organization_id,group_id,engagement_id,added_by_membership_id) values($1,$2,$3,$4,$5)",
            [groupAthleteId, ids.org, groupId, ids.engagement, ids.ownerMembership],
          );
          await pool.query(
            "insert into public.organization_group_coach_assignments(id,organization_id,group_id,coach_membership_id,assigned_by_membership_id) values($1,$2,$3,$4,$5)",
            [groupCoachId, ids.org, groupId, ids.coachMembership, ids.ownerMembership],
          );
          const lifecycle = await racePool.connect();
          const reviewer = await racePool.connect();
          try {
            await lifecycle.query("begin");
            await lifecycle.query(
              "set local lock_timeout = '3s'; set local statement_timeout = '5s'",
            );
            await lifecycle.query("select 1 from public.organizations where id=$1 for update", [
              ids.org,
            ]);
            if (revocation === "coach_assignment")
              await lifecycle.query(
                "update public.organization_group_coach_assignments set ended_at=now(), ended_by_membership_id=$1 where id=$2",
                [ids.ownerMembership, groupCoachId],
              );
            else if (revocation === "athlete_membership")
              await lifecycle.query(
                "update public.organization_group_athletes set ended_at=now(), ended_by_membership_id=$1 where id=$2",
                [ids.ownerMembership, groupAthleteId],
              );
            else
              await lifecycle.query(
                "update public.organization_groups set archived_at=now(), archived_by_membership_id=$1 where id=$2",
                [ids.ownerMembership, groupId],
              );

            await reviewer.query("begin");
            await reviewer.query(
              "set local lock_timeout = '3s'; set local statement_timeout = '5s'",
            );
            // The candidate's service_role has INSERT on reviews but deliberately
            // lacks UPDATE on organizations, which the trigger's common fence
            // requires; the trusted server connection is therefore the permitted
            // execution role for this raw trigger race.  The focused run above
            // observed service_role fail closed with SQLSTATE 42501 before any
            // review can be inserted.
            const backend = (
              await reviewer.query<{ pid: number }>("select pg_backend_pid() as pid")
            ).rows[0];
            const pid = backend?.pid;
            if (!pid) throw new Error("service-role reviewer backend ID missing");
            const insert = reviewer.query(
              "insert into public.coaching_completion_reviews(organization_id,engagement_id,athlete_profile_id,session_id,activity_id,evidence_version,reviewed_by_profile_id,reviewed_by_membership_id,review_authority_kind,reviewed_by_group_coach_assignment_id,reviewed_by_group_athlete_membership_id) values($1,$2,$3,$4,$5,$6,$7,$8,'group',$9,$10)",
              [
                ids.org,
                ids.engagement,
                ids.athlete,
                ids.session,
                ids.activity,
                evidenceVersion,
                ids.coach,
                ids.coachMembership,
                groupCoachId,
                groupAthleteId,
              ],
            );
            for (let attempt = 0; attempt < 100; attempt += 1) {
              const waiting = await racePool.query<{ waiting: boolean }>(
                `select exists (
                 select 1 from pg_stat_activity activity
                 where activity.pid = $1 and activity.wait_event_type = 'Lock'
               ) as waiting`,
                [pid],
              );
              if (waiting.rows[0]?.waiting) break;
              if (attempt === 99)
                throw new Error(
                  `trusted reviewer ${revocation} insert did not wait on organization`,
                );
              await new Promise<void>((resolve) => setImmediate(resolve));
            }
            await lifecycle.query("commit");
            await assert.rejects(insert, /active assigned coach|group authority facts|serialize/);
            await reviewer.query("rollback");
            const rows = await pool.query(
              "select id from public.coaching_completion_reviews where evidence_version=$1",
              [evidenceVersion],
            );
            assert.equal(rows.rowCount, 0, `${revocation} race must not retain a review`);
          } finally {
            await lifecycle.query("rollback").catch(() => undefined);
            await reviewer.query("rollback").catch(() => undefined);
            lifecycle.release();
            reviewer.release();
          }
        }
      } finally {
        await racePool.end();
      }
      await assert.rejects(
        () =>
          pool.query(
            "update public.coaching_completion_reviews set evidence_version='changed' where session_id=$1",
            [ids.session],
          ),
        /immutable/,
      );
      await assert.rejects(
        () =>
          pool.query("delete from public.coaching_completion_reviews where session_id=$1", [
            ids.session,
          ]),
        /immutable/,
      );
      await assert.rejects(
        () => applyCoachingCompletionReviewUpgrade(pool),
        /pre-upgrade fingerprint mismatch/,
      );
    },
  );
  console.log(
    "[coaching:completion-review:upgrade:test] prerequisite upgrade, retained row, exact fingerprint, unexpected-state/replay refusal and backup-manifest target guards passed",
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "completion review upgrade proof failed");
  process.exitCode = 1;
});
