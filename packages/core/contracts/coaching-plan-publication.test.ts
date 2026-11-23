import { describe, expect, it } from "vitest";
import type {
  CoachingPlanDraftSession,
  CoachingPlanPublishPreviewInput,
} from "./coaching-plan-publication";
import {
  athletePlanEditGrantSchema,
  coachingPlanDraftVersionSchema,
  coachingPlanPublishPreviewInputSchema,
  confirmCoachingPlanPublication,
  previewCoachingPlanPublication,
} from "./coaching-plan-publication";

const IDS = {
  organization: "11111111-1111-4111-8111-111111111111",
  athlete: "22222222-2222-4222-8222-222222222222",
  coach: "33333333-3333-4333-8333-333333333333",
  plan: "44444444-4444-4444-8444-444444444444",
  grant: "55555555-5555-4555-8555-555555555555",
  draft: "66666666-6666-4666-8666-666666666666",
  published: "77777777-7777-4777-8777-777777777777",
  completed: "88888888-8888-4888-8888-888888888888",
  confirmation: "99999999-9999-4999-8999-999999999999",
} as const;

function input(): CoachingPlanPublishPreviewInput {
  return {
    grant: {
      grantId: IDS.grant,
      organizationId: IDS.organization,
      athleteProfileId: IDS.athlete,
      coachMembershipId: IDS.coach,
      grantedAt: "2026-11-01T00:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
    },
    draft: {
      organizationId: IDS.organization,
      athleteProfileId: IDS.athlete,
      trainingPlanId: IDS.plan,
      revision: 4,
      authorMembershipId: IDS.coach,
      audience: "athlete" as const,
      sessions: [
        session(IDS.draft, "draft"),
        session(IDS.published, "published"),
        session(IDS.completed, "completed"),
      ],
    },
    actorMembershipId: IDS.coach,
    expectedRevision: 4,
    scope: {
      startDate: "2026-11-09",
      endDate: "2026-11-15",
      athleteTimezone: "Europe/London",
      recipientProfileIds: [IDS.athlete],
      recipientsFingerprint: "recipients-v1",
    },
    previewFingerprint: "preview-v1",
    evaluatedAt: "2026-11-09T12:00:00.000Z",
  };
}

function session(id: string, state: CoachingPlanDraftSession["state"]): CoachingPlanDraftSession {
  return {
    id,
    localId: `local-${id}`,
    offsetDays: 0,
    demand: {
      activity_category: "run",
      training_intent: "durable_endurance",
      target_duration_minutes: 45,
      target_common_load: null,
      importance: "normal",
    },
    activityPlan: null,
    planningDate: "2026-11-10",
    state,
  };
}

describe("coaching plan publication contracts", () => {
  it("requires an explicit plan-edit grant rather than a read-like UI permission", () => {
    expect(
      athletePlanEditGrantSchema.safeParse({
        scope: "training",
        policyVersionId: IDS.grant,
        grantedAt: "2026-11-01T00:00:00.000Z",
        expiresAt: null,
        endedAt: null,
      }).success,
    ).toBe(false);
    expect(
      coachingPlanPublishPreviewInputSchema.safeParse({ ...input(), canPublish: true }).success,
    ).toBe(false);

    expect(
      previewCoachingPlanPublication({
        ...input(),
        grant: { ...input().grant, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      }),
    ).toEqual({ status: "denied", reason: "grant_scope_mismatch" });
  });

  it.each([
    ["expiry at evaluation", { expiresAt: "2026-11-09T12:00:00.000Z" }, "grant_expired"],
    ["revocation at evaluation", { revokedAt: "2026-11-09T12:00:00.000Z" }, "grant_revoked"],
    ["future grant", { grantedAt: "2026-11-09T12:01:00.000Z" }, "grant_not_effective"],
  ] as const)("rejects %s", (_label, grantChange, reason) => {
    expect(
      previewCoachingPlanPublication({ ...input(), grant: { ...input().grant, ...grantChange } }),
    ).toEqual({
      status: "denied",
      reason,
    });
  });

  it("rejects impossible grant chronology and duplicate session IDs", () => {
    expect(
      athletePlanEditGrantSchema.safeParse({
        ...input().grant,
        expiresAt: "2026-10-31T23:59:59.000Z",
        revokedAt: "2026-10-31T23:59:59.000Z",
      }).success,
    ).toBe(false);
    expect(
      coachingPlanPublishPreviewInputSchema.safeParse({
        ...input(),
        scope: { ...input().scope, startDate: "2026-11-15", endDate: "2026-11-09" },
      }).success,
    ).toBe(false);
    expect(
      coachingPlanDraftVersionSchema.safeParse({
        ...input().draft,
        sessions: [session(IDS.draft, "draft"), session(IDS.draft, "published")],
      }).success,
    ).toBe(false);
  });

  it("denies cross-organization, actor, and recipient scope mismatch", () => {
    const base = input();
    expect(
      previewCoachingPlanPublication({
        ...base,
        draft: { ...base.draft, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      }),
    ).toEqual({ status: "denied", reason: "grant_scope_mismatch" });
    expect(
      previewCoachingPlanPublication({
        ...base,
        actorMembershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toEqual({ status: "denied", reason: "grant_scope_mismatch" });
    expect(
      previewCoachingPlanPublication({
        ...base,
        scope: {
          ...base.scope,
          recipientProfileIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        },
      }),
    ).toEqual({ status: "denied", reason: "grant_scope_mismatch" });
  });

  it("rejects a changed revision and keeps published and completed sessions out of the eligible set", () => {
    expect(previewCoachingPlanPublication({ ...input(), expectedRevision: 3 })).toEqual({
      status: "stale_revision",
      expectedRevision: 3,
      currentRevision: 4,
    });

    expect(previewCoachingPlanPublication(input())).toMatchObject({
      status: "ready",
      eligibleDraftSessionIds: [IDS.draft],
      protectedHistorySessionIds: [IDS.published, IDS.completed],
    });
  });

  it("uses the athlete-local current date and never publishes past drafts", () => {
    const base = input();
    expect(
      previewCoachingPlanPublication({
        ...base,
        scope: { ...base.scope, startDate: "2026-11-08", endDate: "2026-11-10" },
        evaluatedAt: "2026-11-10T00:30:00.000Z",
        draft: {
          ...base.draft,
          sessions: [
            { ...session(IDS.draft, "draft"), planningDate: "2026-11-08" },
            { ...session(IDS.published, "published"), planningDate: "2026-11-08" },
          ],
        },
      }),
    ).toEqual({ status: "no_eligible_draft_sessions" });

    expect(
      previewCoachingPlanPublication({
        ...base,
        scope: {
          ...base.scope,
          startDate: "2026-11-09",
          endDate: "2026-11-10",
          athleteTimezone: "America/Los_Angeles",
        },
        evaluatedAt: "2026-11-10T00:30:00.000Z",
        draft: {
          ...base.draft,
          sessions: [{ ...session(IDS.draft, "draft"), planningDate: "2026-11-09" }],
        },
      }),
    ).toMatchObject({ status: "ready", eligibleDraftSessionIds: [IDS.draft] });
  });

  it("classifies a matching confirmed publication retry as an idempotent replay", () => {
    const preview = previewCoachingPlanPublication(input());
    const first = confirmCoachingPlanPublication({
      preview,
      idempotencyKey: "publish-week-2026-11-09",
      scopeFingerprint: "scope-v1",
      confirmationId: IDS.confirmation,
      existingConfirmation: null,
    });
    expect(first.status).toBe("confirmed");
    if (first.status !== "confirmed") throw new Error("Expected an initial confirmation.");

    const replay = confirmCoachingPlanPublication({
      preview,
      idempotencyKey: "publish-week-2026-11-09",
      scopeFingerprint: "scope-v1",
      confirmationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      existingConfirmation: first.confirmation,
    });
    expect(replay.status).toBe("idempotent_replay");
    if (replay.status !== "idempotent_replay") throw new Error("Expected an idempotent replay.");
    expect(replay.confirmation).toEqual(first.confirmation);
  });
});
