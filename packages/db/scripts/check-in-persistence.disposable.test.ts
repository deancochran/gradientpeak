#!/usr/bin/env tsx

import {
  materializeCheckInOccurrence,
  publishedCheckInTemplateVersionSchema,
  validateCheckInDraft,
} from "@repo/core/coaching/check-ins";
import { Pool } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const ids = {
  owner: "10000000-0000-4000-8000-000000000201",
  coach: "10000000-0000-4000-8000-000000000202",
  athlete: "10000000-0000-4000-8000-000000000203",
  otherCoach: "10000000-0000-4000-8000-000000000204",
  org: "20000000-0000-4000-8000-000000000201",
  otherOrg: "20000000-0000-4000-8000-000000000202",
  ownerMembership: "30000000-0000-4000-8000-000000000201",
  coachMembership: "30000000-0000-4000-8000-000000000202",
  otherOwnerMembership: "30000000-0000-4000-8000-000000000203",
  otherCoachMembership: "30000000-0000-4000-8000-000000000204",
  engagement: "40000000-0000-4000-8000-000000000201",
  template: "50000000-0000-4000-8000-000000000201",
  version: "50000000-0000-4000-8000-000000000202",
  otherTemplate: "50000000-0000-4000-8000-000000000203",
  otherVersion: "50000000-0000-4000-8000-000000000204",
  schedule: "60000000-0000-4000-8000-000000000201",
  occurrence: "60000000-0000-4000-8000-000000000202",
  submission: "70000000-0000-4000-8000-000000000201",
  followUp: "70000000-0000-4000-8000-000000000202",
} as const;

async function expectFailure(action: () => Promise<unknown>, label: string) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function expectRoleDenied(
  db: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  role: "anon" | "authenticated",
  statement: string,
) {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    await expectFailure(() => db.query(statement), `${role} direct check-in access`);
  } finally {
    await db.query("rollback");
  }
}

async function seedOrganization(
  db: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  input: { organizationId: string; ownerMembershipId: string; slug: string },
) {
  await db.query("begin");
  try {
    await db.query("set constraints all deferred");
    await db.query(
      `insert into public.organizations
        (id, created_by_profile_id, root_owner_membership_id, name, slug, timezone)
       values ($1, $2, $3, $4, $5, 'UTC')`,
      [input.organizationId, ids.owner, input.ownerMembershipId, input.slug, input.slug],
    );
    await db.query(
      "insert into public.organization_memberships (id, organization_id, profile_id) values ($1, $2, $3)",
      [input.ownerMembershipId, input.organizationId, ids.owner],
    );
    await db.query(
      "insert into public.organization_membership_role_grants (organization_id, membership_id, role_key) values ($1, $2, 'admin')",
      [input.organizationId, input.ownerMembershipId],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

const questionIds = {
  scale: "80000000-0000-4000-8000-000000000201",
  select: "80000000-0000-4000-8000-000000000203",
  text: "80000000-0000-4000-8000-000000000204",
  good: "80000000-0000-4000-8000-000000000211",
  hard: "80000000-0000-4000-8000-000000000212",
} as const;

function fixtureId(prefix: "5" | "6" | "7" | "9", serial: number) {
  return `${prefix}0000000-0000-4000-8000-${String(serial).padStart(12, "0")}`;
}

function questionsJson(questions: unknown) {
  return JSON.stringify(questions);
}

function templateQuestions(input?: {
  label?: string;
  helpText?: string | null;
  choiceLabel?: string;
}): Array<Record<string, unknown>> {
  return [
    {
      questionId: questionIds.scale,
      kind: "scale_1_to_10",
      label: input?.label ?? "Sleep",
      helpText: input?.helpText ?? null,
      required: true,
      audience: "athlete_and_assigned_coaches",
    },
    {
      questionId: questionIds.select,
      kind: "single_select",
      label: "Feeling",
      helpText: null,
      required: true,
      audience: "athlete_and_assigned_coaches",
      choices: [
        { choiceId: questionIds.good, label: input?.choiceLabel ?? "Good" },
        { choiceId: questionIds.hard, label: "Hard" },
      ],
    },
    {
      questionId: questionIds.text,
      kind: "long_text",
      label: "Notes",
      helpText: null,
      required: true,
      audience: "athlete_and_assigned_coaches",
    },
  ];
}

async function main() {
  await withDisposableDatabase(
    process.argv.slice(2),
    "check_in_persistence",
    async (db, targetUrl) => {
      await bootstrapSupabaseSchemas(db);
      for (const migrationPath of requireFreshBaseline().migrationPaths) {
        await applySqlFile(db, migrationPath);
      }

      for (const profileId of [ids.owner, ids.coach, ids.athlete, ids.otherCoach]) {
        await db.query(
          "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)",
          [profileId, `${profileId}@example.test`],
        );
      }
      await seedOrganization(db, {
        organizationId: ids.org,
        ownerMembershipId: ids.ownerMembership,
        slug: "check-in-primary",
      });
      await seedOrganization(db, {
        organizationId: ids.otherOrg,
        ownerMembershipId: ids.otherOwnerMembership,
        slug: "check-in-other",
      });
      await db.query(
        "insert into public.organization_memberships (id, organization_id, profile_id) values ($1, $2, $3), ($4, $5, $6)",
        [
          ids.coachMembership,
          ids.org,
          ids.coach,
          ids.otherCoachMembership,
          ids.otherOrg,
          ids.otherCoach,
        ],
      );
      await db.query(
        "insert into public.coaching_engagements (id, organization_id, athlete_profile_id) values ($1, $2, $3)",
        [ids.engagement, ids.org, ids.athlete],
      );

      await db.query(
        "insert into public.check_in_templates (id, organization_id, name, created_by_membership_id) values ($1, $2, 'Weekly reflection', $3)",
        [ids.template, ids.org, ids.coachMembership],
      );
      await db.query(
        `insert into public.check_in_template_versions
        (id, organization_id, template_id, version_number, name, questions, published_by_membership_id)
       values ($1, $2, $3, 1, 'Weekly reflection', $4::jsonb, $5)`,
        [
          ids.version,
          ids.org,
          ids.template,
          '[{"questionId":"80000000-0000-4000-8000-000000000201","kind":"scale_1_to_10","label":"Sleep","helpText":null,"required":true,"audience":"athlete_and_assigned_coaches"},{"questionId":"80000000-0000-4000-8000-000000000203","kind":"single_select","label":"Feeling","helpText":null,"required":true,"audience":"athlete_and_assigned_coaches","choices":[{"choiceId":"80000000-0000-4000-8000-000000000211","label":"Good"},{"choiceId":"80000000-0000-4000-8000-000000000212","label":"Hard"}]},{"questionId":"80000000-0000-4000-8000-000000000204","kind":"long_text","label":"Notes","helpText":null,"required":true,"audience":"athlete_and_assigned_coaches"}]',
          ids.coachMembership,
        ],
      );
      await db.query(
        "insert into public.check_in_templates (id, organization_id, name, created_by_membership_id) values ($1, $2, 'Other form', $3)",
        [ids.otherTemplate, ids.otherOrg, ids.otherOwnerMembership],
      );
      await expectFailure(
        () =>
          db.query(
            `insert into public.check_in_template_versions
            (organization_id, template_id, version_number, name, questions, published_by_membership_id)
           values ($1, $2, 2, 'Malformed', '[{}]'::jsonb, $3)`,
            [ids.org, ids.template, ids.coachMembership],
          ),
        "Core-invalid question snapshot",
      );
      await db.query(
        `insert into public.check_in_template_versions
        (id, organization_id, template_id, version_number, name, questions, published_by_membership_id)
       values ($1, $2, $3, 1, 'Other form', '[{"questionId":"80000000-0000-4000-8000-000000000202","kind":"long_text","label":"Other","helpText":null,"required":true,"audience":"athlete_and_assigned_coaches"}]'::jsonb, $4)`,
        [ids.otherVersion, ids.otherOrg, ids.otherTemplate, ids.otherOwnerMembership],
      );

      let templateVersionSerial = 300;
      async function assertTemplateVersionParity(questions: unknown, label: string) {
        const versionId = fixtureId("5", templateVersionSerial++);
        const coreAccepted = publishedCheckInTemplateVersionSchema.safeParse({
          templateId: ids.template,
          versionId,
          versionNumber: templateVersionSerial,
          name: "Parity fixture",
          questions,
        }).success;
        let databaseAccepted = true;
        try {
          await db.query(
            `insert into public.check_in_template_versions
            (id, organization_id, template_id, version_number, name, questions, published_by_membership_id)
           values ($1, $2, $3, $4, 'Parity fixture', $5::jsonb, $6)`,
            [
              versionId,
              ids.org,
              ids.template,
              templateVersionSerial,
              questionsJson(questions),
              ids.coachMembership,
            ],
          );
        } catch {
          databaseAccepted = false;
        }
        if (coreAccepted !== databaseAccepted) {
          throw new Error(`${label} Core/DB template validation parity failed`);
        }
      }

      for (const [label, questionId] of [
        ["UUID v7", "018f5d8c-7c12-8000-8000-000000000001"],
        ["UUID nil", "00000000-0000-0000-0000-000000000000"],
        ["UUID max", "ffffffff-ffff-ffff-ffff-ffffffffffff"],
        ["UUID invalid variant", "10000000-0000-9000-8000-000000000001"],
      ] as const) {
        const questions = templateQuestions();
        const firstQuestion = questions[0];
        if (!firstQuestion)
          throw new Error("check-in parity fixture must include a first question");
        firstQuestion.questionId = questionId;
        await assertTemplateVersionParity(questions, label);
      }

      for (const whitespace of ["\t", "\n", "\u00a0"]) {
        await assertTemplateVersionParity(
          templateQuestions({ label: whitespace }),
          `label ${JSON.stringify(whitespace)}`,
        );
        await assertTemplateVersionParity(
          templateQuestions({ helpText: whitespace }),
          `help text ${JSON.stringify(whitespace)}`,
        );
        await assertTemplateVersionParity(
          templateQuestions({ choiceLabel: whitespace }),
          `choice label ${JSON.stringify(whitespace)}`,
        );
      }

      for (const [field, length] of [
        ["label", 240],
        ["helpText", 1000],
        ["choiceLabel", 160],
      ] as const) {
        for (const count of [length, length + 1]) {
          const emoji = "😀".repeat(count);
          await assertTemplateVersionParity(
            templateQuestions({ [field]: emoji }),
            `${field} UTF-16 ${count}`,
          );
        }
      }

      await expectFailure(
        () =>
          db.query(
            "insert into public.check_in_schedules (organization_id, engagement_id, athlete_profile_id, template_version_id, weekday, local_time, time_zone) values ($1, $2, $3, $4, 'monday', '18:00', 'UTC')",
            [ids.org, ids.engagement, ids.athlete, ids.otherVersion],
          ),
        "cross-organization template version binding",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.check_in_schedules (organization_id, engagement_id, athlete_profile_id, template_version_id, weekday, local_time, time_zone) values ($1, $2, $3, $4, 'monday', '18:00', 'Mars/Olympus')",
            [ids.org, ids.engagement, ids.athlete, ids.version],
          ),
        "unknown IANA time zone",
      );
      const lordHowe = await db.query<{ valid: boolean }>(
        `select public.check_in_local_civil_time_is_valid('2026-10-04', '02:00', 'Australia/Lord_Howe') as valid
       union all
       select public.check_in_local_civil_time_is_valid('2026-04-05', '01:45', 'Australia/Lord_Howe')
       union all
       select public.check_in_local_civil_time_is_valid('2026-04-05', '03:00', 'Australia/Lord_Howe')`,
      );
      if (
        JSON.stringify(lordHowe.rows.map((row) => row.valid)) !==
        JSON.stringify([false, false, true])
      ) {
        throw new Error(
          "Australia/Lord_Howe DST gap/overlap validation did not match Core civil-time semantics",
        );
      }
      await db.query(
        `insert into public.check_in_schedules
        (id, organization_id, engagement_id, athlete_profile_id, template_version_id, weekday, local_time, time_zone)
       values ($1, $2, $3, $4, $5, 'monday', '18:00', 'UTC')`,
        [ids.schedule, ids.org, ids.engagement, ids.athlete, ids.version],
      );
      await expectFailure(
        () =>
          db.query(
            `insert into public.check_in_occurrences
            (organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, period_start_date, scheduled_local_time, time_zone)
           values ($1, $2, $3, $4, $5, '2026-11-10', '18:00', 'UTC')`,
            [ids.org, ids.schedule, ids.engagement, ids.athlete, ids.version],
          ),
        "weekday-mismatched occurrence",
      );
      await db.query(
        `insert into public.check_in_occurrences
        (id, organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, period_start_date, scheduled_local_time, time_zone)
       values ($1, $2, $3, $4, $5, $6, '2026-11-09', '18:00', 'UTC')`,
        [ids.occurrence, ids.org, ids.schedule, ids.engagement, ids.athlete, ids.version],
      );
      const coreVersionForPayloadParity = publishedCheckInTemplateVersionSchema.parse({
        templateId: ids.template,
        versionId: ids.version,
        versionNumber: 1,
        name: "Weekly reflection",
        questions: templateQuestions(),
      });
      let submissionSerial = 0;
      async function assertSubmissionParity(input: {
        label: string;
        scaleJson: "1.0" | "10.0" | "1.5" | "7";
        text: string;
      }) {
        const serial = submissionSerial++;
        const scheduledLocalTime = `20:${String(serial).padStart(2, "0")}`;
        const scheduleId = fixtureId("6", 400 + serial);
        const occurrenceId = fixtureId("6", 500 + serial);
        const answersJson = `[{"questionId":"${questionIds.scale}","kind":"scale_1_to_10","value":${input.scaleJson}},{"questionId":"${questionIds.select}","kind":"single_select","choiceId":"${questionIds.good}"},{"questionId":"${questionIds.text}","kind":"long_text","text":${JSON.stringify(input.text)}}]`;
        const answers: unknown = JSON.parse(answersJson);
        const coreAccepted =
          validateCheckInDraft({
            templateVersion: coreVersionForPayloadParity,
            draft: { templateVersionId: ids.version, answers },
          }).outcome === "valid";
        await db.query(
          `insert into public.check_in_schedules
          (id, organization_id, engagement_id, athlete_profile_id, template_version_id, weekday, local_time, time_zone)
         values ($1, $2, $3, $4, $5, 'monday', $6, 'UTC')`,
          [scheduleId, ids.org, ids.engagement, ids.athlete, ids.version, scheduledLocalTime],
        );
        await db.query(
          `insert into public.check_in_occurrences
          (id, organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, period_start_date, scheduled_local_time, time_zone)
         values ($1, $2, $3, $4, $5, $6, '2026-11-23', $7, 'UTC')`,
          [
            occurrenceId,
            ids.org,
            scheduleId,
            ids.engagement,
            ids.athlete,
            ids.version,
            scheduledLocalTime,
          ],
        );
        let databaseAccepted = true;
        try {
          await db.query(
            `insert into public.check_in_submissions
            (id, organization_id, occurrence_id, engagement_id, athlete_profile_id, template_version_id, submission_revision, idempotency_key, answers)
           values ($1, $2, $3, $4, $5, $6, 1, $7, $8::jsonb)`,
            [
              fixtureId("7", 400 + serial),
              ids.org,
              occurrenceId,
              ids.engagement,
              ids.athlete,
              ids.version,
              fixtureId("9", 400 + serial),
              answersJson,
            ],
          );
        } catch {
          databaseAccepted = false;
        }
        if (coreAccepted !== databaseAccepted) {
          throw new Error(`${input.label} Core/DB submission validation parity failed`);
        }
      }

      for (const scaleJson of ["1.0", "10.0", "1.5"] as const) {
        await assertSubmissionParity({ label: `scale ${scaleJson}`, scaleJson, text: "Ready" });
      }
      for (const whitespace of ["\t", "\n", "\u00a0"]) {
        await assertSubmissionParity({
          label: `long text ${JSON.stringify(whitespace)}`,
          scaleJson: "7",
          text: whitespace,
        });
      }
      for (const count of [2000, 2001]) {
        await assertSubmissionParity({
          label: `long text UTF-16 ${count}`,
          scaleJson: "7",
          text: "😀".repeat(count),
        });
      }
      await expectFailure(
        () =>
          db.query(
            "update public.check_in_occurrences set period_start_date = '2026-11-16' where id = $1",
            [ids.occurrence],
          ),
        "historical occurrence reschedule",
      );
      for (const [column, value] of [
        ["weekday", "tuesday"],
        ["local_time", "19:00"],
        ["time_zone", "Australia/Lord_Howe"],
        ["template_version_id", ids.otherVersion],
      ] as const) {
        await expectFailure(
          () =>
            db.query(`update public.check_in_schedules set ${column} = $1 where id = $2`, [
              value,
              ids.schedule,
            ]),
          `schedule ${column} rewrite after occurrence`,
        );
      }
      await expectFailure(
        () =>
          db.query(
            `insert into public.check_in_occurrences
            (organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, period_start_date, scheduled_local_time, time_zone)
           values ($1, $2, $3, $4, $5, '2026-11-09', '18:00', 'UTC')`,
            [ids.org, ids.schedule, ids.engagement, ids.athlete, ids.version],
          ),
        "duplicate schedule local period",
      );
      const raceSchedule = "60000000-0000-4000-8000-000000000203";
      const raceOccurrenceA = "60000000-0000-4000-8000-000000000204";
      const raceOccurrenceB = "60000000-0000-4000-8000-000000000205";
      await db.query(
        `insert into public.check_in_schedules
        (id, organization_id, engagement_id, athlete_profile_id, template_version_id, weekday, local_time, time_zone)
       values ($1, $2, $3, $4, $5, 'monday', '18:00', 'UTC')`,
        [raceSchedule, ids.org, ids.engagement, ids.athlete, ids.version],
      );
      const raceInsert = (occurrenceId: string) => {
        const connection = new Pool({ connectionString: targetUrl, max: 1 });
        return connection
          .query(
            `insert into public.check_in_occurrences
            (id, organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, period_start_date, scheduled_local_time, time_zone)
           values ($1, $2, $3, $4, $5, $6, '2026-11-16', '18:00', 'UTC')`,
            [occurrenceId, ids.org, raceSchedule, ids.engagement, ids.athlete, ids.version],
          )
          .finally(() => connection.end());
      };
      const occurrenceRace = await Promise.allSettled([
        raceInsert(raceOccurrenceA),
        raceInsert(raceOccurrenceB),
      ]);
      if (occurrenceRace.filter((result) => result.status === "fulfilled").length !== 1) {
        throw new Error(
          "concurrent occurrence materialization did not preserve one local-period row",
        );
      }
      const raceOccurrence =
        occurrenceRace[0]?.status === "fulfilled" ? raceOccurrenceA : raceOccurrenceB;
      const idempotencyRaceSchedule = "60000000-0000-4000-8000-000000000206";
      const idempotencyRaceOccurrence = "60000000-0000-4000-8000-000000000207";
      await db.query(
        `insert into public.check_in_schedules
         (id, organization_id, engagement_id, athlete_profile_id, template_version_id, weekday, local_time, time_zone)
        values ($1, $2, $3, $4, $5, 'monday', '19:00', 'UTC')`,
        [idempotencyRaceSchedule, ids.org, ids.engagement, ids.athlete, ids.version],
      );
      await db.query(
        `insert into public.check_in_occurrences
         (id, organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, period_start_date, scheduled_local_time, time_zone)
        values ($1, $2, $3, $4, $5, $6, '2026-11-16', '19:00', 'UTC')`,
        [
          idempotencyRaceOccurrence,
          ids.org,
          idempotencyRaceSchedule,
          ids.engagement,
          ids.athlete,
          ids.version,
        ],
      );
      const submissionRace = await Promise.allSettled(
        [
          ["70000000-0000-4000-8000-000000000203", raceOccurrence],
          ["70000000-0000-4000-8000-000000000204", idempotencyRaceOccurrence],
        ].map(([submissionId, occurrenceId]) => {
          const connection = new Pool({ connectionString: targetUrl, max: 1 });
          return connection
            .query(
              `insert into public.check_in_submissions
                (id, organization_id, occurrence_id, engagement_id, athlete_profile_id, template_version_id, submission_revision, idempotency_key, answers)
               values ($1, $2, $3, $4, $5, $6, 1, $7, '[{"questionId":"80000000-0000-4000-8000-000000000201","kind":"scale_1_to_10","value":7},{"questionId":"80000000-0000-4000-8000-000000000203","kind":"single_select","choiceId":"80000000-0000-4000-8000-000000000211"},{"questionId":"80000000-0000-4000-8000-000000000204","kind":"long_text","text":"Ready"}]'::jsonb)`,
              [
                submissionId,
                ids.org,
                occurrenceId,
                ids.engagement,
                ids.athlete,
                ids.version,
                "90000000-0000-4000-8000-000000000203",
              ],
            )
            .finally(() => connection.end());
        }),
      );
      if (submissionRace.filter((result) => result.status === "fulfilled").length !== 1) {
        throw new Error("concurrent same-athlete idempotency insert did not preserve one key row");
      }
      await expectFailure(
        () =>
          db.query(
            `insert into public.check_in_submissions
            (organization_id, occurrence_id, engagement_id, athlete_profile_id, template_version_id, submission_revision, idempotency_key, answers)
           values ($1, $2, $3, $4, $5, 1, '90000000-0000-4000-8000-000000000200', '[]'::jsonb)`,
            [ids.org, ids.occurrence, ids.engagement, ids.athlete, ids.version],
          ),
        "missing required answer",
      );
      await expectFailure(
        () =>
          db.query(
            `insert into public.check_in_submissions
            (organization_id, occurrence_id, engagement_id, athlete_profile_id, template_version_id, submission_revision, idempotency_key, answers, reviewed_at, reviewed_by_membership_id, reviewed_by_profile_id)
           values ($1, $2, $3, $4, $5, 1, '90000000-0000-4000-8000-000000000299', '[{"questionId":"80000000-0000-4000-8000-000000000201","kind":"scale_1_to_10","value":7},{"questionId":"80000000-0000-4000-8000-000000000203","kind":"single_select","choiceId":"80000000-0000-4000-8000-000000000211"},{"questionId":"80000000-0000-4000-8000-000000000204","kind":"long_text","text":"Ready"}]'::jsonb, now(), $6, $7)`,
            [
              ids.org,
              ids.occurrence,
              ids.engagement,
              ids.athlete,
              ids.version,
              ids.coachMembership,
              ids.coach,
            ],
          ),
        "pre-reviewed submission insert",
      );
      await db.query(
        `insert into public.check_in_submissions
        (id, organization_id, occurrence_id, engagement_id, athlete_profile_id, template_version_id, submission_revision, idempotency_key, answers)
        values ($1, $2, $3, $4, $5, $6, 1, '90000000-0000-4000-8000-000000000201', '[{"questionId":"80000000-0000-4000-8000-000000000201","kind":"scale_1_to_10","value":7},{"questionId":"80000000-0000-4000-8000-000000000203","kind":"single_select","choiceId":"80000000-0000-4000-8000-000000000211"},{"questionId":"80000000-0000-4000-8000-000000000204","kind":"long_text","text":"Ready"}]'::jsonb)`,
        [ids.submission, ids.org, ids.occurrence, ids.engagement, ids.athlete, ids.version],
      );
      await expectFailure(
        () =>
          db.query(
            `insert into public.check_in_submissions
            (organization_id, occurrence_id, engagement_id, athlete_profile_id, template_version_id, submission_revision, idempotency_key, answers)
           values ($1, $2, $3, $4, $5, 1, '90000000-0000-4000-8000-000000000202', '[]'::jsonb)`,
            [ids.org, ids.occurrence, ids.engagement, ids.athlete, ids.version],
          ),
        "duplicate occurrence submission",
      );
      await expectFailure(
        () =>
          db.query("update public.check_in_submissions set reviewed_at = now() where id = $1", [
            ids.submission,
          ]),
        "incomplete review state",
      );
      await expectFailure(
        () =>
          db.query(
            "update public.check_in_submissions set reviewed_at = now(), reviewed_by_membership_id = $1, reviewed_by_profile_id = $2 where id = $3",
            [ids.otherCoachMembership, ids.otherCoach, ids.submission],
          ),
        "cross-organization reviewer attribution",
      );
      await db.query(
        `insert into public.check_in_follow_ups
        (id, organization_id, submission_id, engagement_id, athlete_profile_id, created_by_membership_id, assigned_to_membership_id, description, due_date)
       values ($1, $2, $3, $4, $5, $6, $6, 'Adjust travel-week training', '2026-11-12')`,
        [ids.followUp, ids.org, ids.submission, ids.engagement, ids.athlete, ids.coachMembership],
      );
      const unreviewed = await db.query<{ reviewed_at: Date | null }>(
        "select reviewed_at from public.check_in_submissions where id = $1",
        [ids.submission],
      );
      if (unreviewed.rows[0]?.reviewed_at !== null)
        throw new Error("creating a follow-up silently marked the submission reviewed");
      await db.query(
        "update public.check_in_submissions set reviewed_at = now(), reviewed_by_membership_id = $1, reviewed_by_profile_id = $2 where id = $3",
        [ids.coachMembership, ids.coach, ids.submission],
      );
      await expectFailure(
        () =>
          db.query("update public.check_in_submissions set answers = '[]'::jsonb where id = $1", [
            ids.submission,
          ]),
        "submitted answer rewrite",
      );
      await expectFailure(
        () =>
          db.query(
            "update public.check_in_template_versions set name = 'Rewritten' where id = $1",
            [ids.version],
          ),
        "published question snapshot rewrite",
      );
      await db.query(
        "update public.check_in_templates set name = 'Renamed template' where id = $1",
        [ids.template],
      );
      const snapshot = await db.query<{
        question_label: string | null;
        answer_value: number | null;
      }>(
        `select version.questions->0->>'label' as question_label,
        (submission.answers->0->>'value')::integer as answer_value
       from public.check_in_template_versions version
       join public.check_in_submissions submission on submission.template_version_id = version.id
       where version.id = $1 and submission.id = $2`,
        [ids.version, ids.submission],
      );
      if (snapshot.rowCount !== 1)
        throw new Error("historical submission no longer resolves its version snapshot");
      if (snapshot.rows[0]?.question_label !== "Sleep" || snapshot.rows[0]?.answer_value !== 7) {
        throw new Error("template rename altered the historical version or submitted answers");
      }
      const persistedVersion = publishedCheckInTemplateVersionSchema.parse({
        templateId: ids.template,
        versionId: ids.version,
        versionNumber: 1,
        name: "Weekly reflection",
        questions: (
          await db.query<{ questions: unknown }>(
            "select questions from public.check_in_template_versions where id = $1",
            [ids.version],
          )
        ).rows[0]?.questions,
      });
      const persistedAnswers = (
        await db.query<{ answers: unknown }>(
          "select answers from public.check_in_submissions where id = $1",
          [ids.submission],
        )
      ).rows[0]?.answers;
      if (
        validateCheckInDraft({
          templateVersion: persistedVersion,
          draft: { templateVersionId: persistedVersion.versionId, answers: persistedAnswers },
        }).outcome !== "valid"
      ) {
        throw new Error(
          "stored submission answers no longer round-trip through the Core draft contract",
        );
      }
      for (const { date, time, timeZone, valid } of [
        { date: "2026-10-04", time: "02:00", timeZone: "Australia/Lord_Howe", valid: false },
        { date: "2026-04-05", time: "01:45", timeZone: "Australia/Lord_Howe", valid: false },
        { date: "2026-04-05", time: "03:00", timeZone: "Australia/Lord_Howe", valid: true },
        { date: "2026-03-08", time: "02:30", timeZone: "America/New_York", valid: false },
        { date: "2026-11-01", time: "01:30", timeZone: "America/New_York", valid: false },
        { date: "2026-03-08", time: "02:30", timeZone: "UTC", valid: true },
      ]) {
        const coreResult = materializeCheckInOccurrence({
          periodStartDate: date,
          scheduledLocalTime: time,
          timeZone,
        });
        const coreValid = coreResult.outcome === "materialized";
        const databaseValid = (
          await db.query<{ valid: boolean }>(
            "select public.check_in_local_civil_time_is_valid($1::date, $2, $3) as valid",
            [date, time, timeZone],
          )
        ).rows[0]?.valid;
        if (coreValid !== valid || databaseValid !== valid) {
          throw new Error(`Core/SQL civil-time parity failed for ${date} ${time} ${timeZone}`);
        }
      }

      let civilTimeSerial = 0;
      for (const { date, time, timeZone, expectedOutcome, expectedReason } of [
        {
          date: "2026-10-04",
          time: "02:00",
          timeZone: "Australia/Lord_Howe",
          expectedOutcome: "needs_reschedule",
          expectedReason: "nonexistent_local_time",
        },
        {
          date: "2026-04-05",
          time: "01:45",
          timeZone: "Australia/Lord_Howe",
          expectedOutcome: "needs_reschedule",
          expectedReason: "ambiguous_local_time",
        },
        {
          date: "2026-04-05",
          time: "03:00",
          timeZone: "Australia/Lord_Howe",
          expectedOutcome: "materialized",
          expectedReason: undefined,
        },
        {
          date: "2026-03-08",
          time: "02:30",
          timeZone: "America/New_York",
          expectedOutcome: "needs_reschedule",
          expectedReason: "nonexistent_local_time",
        },
        {
          date: "2026-11-01",
          time: "01:30",
          timeZone: "America/New_York",
          expectedOutcome: "needs_reschedule",
          expectedReason: "ambiguous_local_time",
        },
        {
          date: "2026-03-08",
          time: "02:30",
          timeZone: "UTC",
          expectedOutcome: "materialized",
          expectedReason: undefined,
        },
      ]) {
        const serial = civilTimeSerial++;
        const scheduleId = fixtureId("6", 700 + serial);
        const occurrenceId = fixtureId("6", 800 + serial);
        const coreResult = materializeCheckInOccurrence({
          periodStartDate: date,
          scheduledLocalTime: time,
          timeZone,
        });
        if (coreResult.outcome !== expectedOutcome) {
          throw new Error(
            `Core materialization failed its DST contract for ${date} ${time} ${timeZone}`,
          );
        }
        if (coreResult.outcome === "needs_reschedule" && coreResult.reason !== expectedReason) {
          throw new Error(`Core materialization reason failed for ${date} ${time} ${timeZone}`);
        }
        await db.query(
          `insert into public.check_in_schedules
          (id, organization_id, engagement_id, athlete_profile_id, template_version_id, weekday, local_time, time_zone)
         values ($1, $2, $3, $4, $5, 'sunday', $6, $7)`,
          [scheduleId, ids.org, ids.engagement, ids.athlete, ids.version, time, timeZone],
        );
        let databaseAccepted = true;
        try {
          await db.query(
            `insert into public.check_in_occurrences
            (id, organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, period_start_date, scheduled_local_time, time_zone)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              occurrenceId,
              ids.org,
              scheduleId,
              ids.engagement,
              ids.athlete,
              ids.version,
              date,
              time,
              timeZone,
            ],
          );
        } catch {
          databaseAccepted = false;
        }
        if ((coreResult.outcome === "materialized") !== databaseAccepted) {
          throw new Error(
            `Core/DB occurrence materialization parity failed for ${date} ${time} ${timeZone}`,
          );
        }
      }

      await expectRoleDenied(db, "anon", "select * from public.check_in_submissions");
      await expectRoleDenied(
        db,
        "authenticated",
        "insert into public.check_in_submissions (answers) values ('[]'::jsonb)",
      );
      console.log(
        "[db:check-ins] disposable tenant, version, duplicate, review, immutable-history, follow-up, and direct-role fences passed",
      );
    },
  );
}

main().catch((error) => {
  console.error(`[db:check-ins] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
