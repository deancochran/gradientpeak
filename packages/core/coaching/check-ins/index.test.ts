import { describe, expect, expectTypeOf, it } from "vitest";

import type { CheckInQuestion, PublishedCheckInTemplateVersion } from "./index";
import {
  createCheckInFollowUp,
  decideCheckInSubmission,
  getCheckInReviewState,
  markCheckInReviewed,
  materializeCheckInOccurrence,
  publishCheckInTemplateVersion,
  publishedCheckInTemplateVersionSchema,
  scheduledCheckInOccurrenceSchema,
  validateCheckInDraft,
  validateCheckInOccurrenceBinding,
} from "./index";

const ids = {
  template: "00000000-0000-4000-8000-000000000001",
  version: "00000000-0000-4000-8000-000000000002",
  requiredScale: "00000000-0000-4000-8000-000000000003",
  optionalText: "00000000-0000-4000-8000-000000000004",
  feeling: "00000000-0000-4000-8000-000000000005",
  good: "00000000-0000-4000-8000-000000000006",
  hard: "00000000-0000-4000-8000-000000000007",
  schedule: "00000000-0000-4000-8000-000000000008",
  occurrence: "00000000-0000-4000-8000-000000000009",
  engagement: "00000000-0000-4000-8000-000000000010",
  athlete: "00000000-0000-4000-8000-000000000011",
  submission: "00000000-0000-4000-8000-000000000012",
  task: "00000000-0000-4000-8000-000000000013",
  coach: "00000000-0000-4000-8000-000000000014",
};

function template() {
  return publishCheckInTemplateVersion({
    templateId: ids.template,
    versionId: ids.version,
    versionNumber: 1,
    name: "Weekly reflection",
    questions: [
      {
        questionId: ids.requiredScale,
        kind: "scale_1_to_10",
        label: "Sleep quality",
        helpText: null,
        required: true,
      },
      {
        questionId: ids.feeling,
        kind: "single_select",
        label: "Training felt",
        helpText: null,
        required: true,
        choices: [
          { choiceId: ids.good, label: "Good" },
          { choiceId: ids.hard, label: "Hard" },
        ],
      },
      {
        questionId: ids.optionalText,
        kind: "long_text",
        label: "Anything else?",
        helpText: null,
        required: false,
      },
    ],
  });
}

function occurrence() {
  return scheduledCheckInOccurrenceSchema.parse({
    occurrenceId: ids.occurrence,
    scheduleId: ids.schedule,
    templateVersionId: ids.version,
    engagementId: ids.engagement,
    periodStartDate: "2028-11-05",
    scheduledLocalTime: "18:00",
    timeZone: "America/New_York",
  });
}

function schedule() {
  return {
    scheduleId: ids.schedule,
    templateVersionId: ids.version,
    engagementId: ids.engagement,
    weekday: "sunday" as const,
    localTime: "18:00",
    timeZone: "America/New_York",
  };
}

function completeDraft() {
  return {
    templateVersionId: ids.version,
    answers: [
      { questionId: ids.feeling, kind: "single_select" as const, choiceId: ids.good },
      { questionId: ids.requiredScale, kind: "scale_1_to_10" as const, value: 7 },
    ],
  };
}

function existingSubmission(answers: unknown = completeDraft().answers) {
  return {
    submissionId: ids.submission,
    occurrenceId: ids.occurrence,
    actorProfileId: ids.athlete,
    templateVersionId: ids.version,
    answers,
  };
}

describe("fixed-template check-in contracts", () => {
  it("retains an optional draft and labels missing required answers incomplete", () => {
    const result = validateCheckInDraft({
      templateVersion: template(),
      draft: {
        templateVersionId: ids.version,
        answers: [{ questionId: ids.optionalText, kind: "long_text", text: "Travel Thursday" }],
      },
    });

    expect(result).toMatchObject({ outcome: "valid", completeness: "incomplete" });
    if (result.outcome === "valid") expect(result.draft.answers).toHaveLength(1);
  });

  it("rejects version/question mismatches and malformed answers", () => {
    expect(
      validateCheckInDraft({
        templateVersion: template(),
        draft: { ...completeDraft(), templateVersionId: ids.template },
      }),
    ).toMatchObject({ outcome: "invalid", reason: "template_version_mismatch" });
    expect(
      validateCheckInDraft({
        templateVersion: template(),
        draft: {
          templateVersionId: ids.version,
          answers: [{ questionId: ids.requiredScale, kind: "scale_1_to_10", value: 11 }],
        },
      }),
    ).toMatchObject({ outcome: "invalid", reason: "malformed_answer" });
    expect(
      validateCheckInDraft({
        templateVersion: template(),
        draft: {
          templateVersionId: ids.version,
          answers: [{ questionId: ids.template, kind: "long_text", text: "No" }],
        },
      }),
    ).toMatchObject({ outcome: "invalid", reason: "unknown_question" });
  });

  it("makes published versions immutable snapshot copies", () => {
    const source = {
      templateId: ids.template,
      versionId: ids.version,
      versionNumber: 1,
      name: "Weekly reflection",
      questions: [
        {
          questionId: ids.requiredScale,
          kind: "scale_1_to_10" as const,
          label: "Sleep quality",
          helpText: null,
          required: true,
        },
      ],
    };
    const version = publishCheckInTemplateVersion(source);
    const sourceQuestion = source.questions[0];
    if (!sourceQuestion) throw new Error("test fixture must include a question");
    sourceQuestion.label = "Changed after publishing";

    expect(version.questions[0]?.label).toBe("Sleep quality");
    expect(Object.isFrozen(version)).toBe(true);
    expect(Object.isFrozen(version.questions)).toBe(true);
    expect(Object.isFrozen(version.questions[0])).toBe(true);
    const parsed = publishedCheckInTemplateVersionSchema.parse(source);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.questions)).toBe(true);
    expect(Object.isFrozen(parsed.questions[0])).toBe(true);
    const parsedWithChoices = publishedCheckInTemplateVersionSchema.parse({
      templateId: ids.template,
      versionId: ids.version,
      versionNumber: 1,
      name: "Weekly reflection",
      questions: [
        {
          questionId: ids.feeling,
          kind: "single_select",
          label: "Training felt",
          helpText: null,
          required: true,
          choices: [
            { choiceId: ids.good, label: "Good" },
            { choiceId: ids.hard, label: "Hard" },
          ],
        },
      ],
    });
    const parsedChoiceQuestion = parsedWithChoices.questions[0];
    if (!parsedChoiceQuestion || parsedChoiceQuestion.kind !== "single_select") {
      throw new Error("parsed fixture must include a single-select question");
    }
    expect(Object.isFrozen(parsedChoiceQuestion.choices)).toBe(true);
    expect(Object.isFrozen(parsedChoiceQuestion.choices[0])).toBe(true);
    const versionWithChoices = template();
    const choiceQuestion = versionWithChoices.questions[1];
    if (!choiceQuestion || choiceQuestion.kind !== "single_select") {
      throw new Error("test fixture must include a single-select question");
    }
    expect(Object.isFrozen(choiceQuestion.choices)).toBe(true);
    expect(Object.isFrozen(choiceQuestion.choices[0])).toBe(true);
    expect(
      versionWithChoices.questions.every(
        (question) => question.audience === "athlete_and_assigned_coaches",
      ),
    ).toBe(true);

    expectTypeOf<PublishedCheckInTemplateVersion>().toMatchTypeOf<{
      readonly questions: readonly CheckInQuestion[];
    }>();
    expectTypeOf<Extract<CheckInQuestion, { kind: "single_select" }>["choices"]>().toMatchTypeOf<
      readonly { readonly choiceId: string; readonly label: string }[]
    >();
    expectTypeOf<readonly { readonly choiceId: string; readonly label: string }[]>().toMatchTypeOf<
      Extract<CheckInQuestion, { kind: "single_select" }>["choices"]
    >();
  });

  it("validates actual Gregorian local civil time and IANA zone", () => {
    const valid = occurrence();
    expect(valid.periodStartDate).toBe("2028-11-05");
    expect(
      scheduledCheckInOccurrenceSchema.safeParse({ ...valid, periodStartDate: "2027-02-29" })
        .success,
    ).toBe(false);
    expect(
      scheduledCheckInOccurrenceSchema.safeParse({ ...valid, periodStartDate: "2028-02-29" })
        .success,
    ).toBe(true);
    expect(
      scheduledCheckInOccurrenceSchema.safeParse({
        ...valid,
        periodStartDate: "2028-03-12",
        scheduledLocalTime: "02:30",
      }).success,
    ).toBe(false);
    expect(
      scheduledCheckInOccurrenceSchema.safeParse({ ...valid, timeZone: "Mars/Olympus" }).success,
    ).toBe(false);
    expect(validateCheckInOccurrenceBinding({ schedule: schedule(), occurrence: valid })).toEqual({
      outcome: "valid",
    });
    expect(
      validateCheckInOccurrenceBinding({
        schedule: schedule(),
        occurrence: scheduledCheckInOccurrenceSchema.parse({
          ...valid,
          periodStartDate: "2028-11-06",
        }),
      }),
    ).toEqual({ outcome: "invalid", reason: "period_weekday_mismatch" });
    expect(
      validateCheckInOccurrenceBinding({
        schedule: { ...schedule(), localTime: "19:00" },
        occurrence: valid,
      }),
    ).toEqual({ outcome: "invalid", reason: "schedule_mismatch" });
  });

  it("requires rescheduling for nonexistent and ambiguous DST local times", () => {
    expect(
      materializeCheckInOccurrence({
        periodStartDate: "2028-03-12",
        scheduledLocalTime: "02:30",
        timeZone: "America/New_York",
      }),
    ).toEqual({
      outcome: "needs_reschedule",
      reason: "nonexistent_local_time",
      message:
        "This local time does not occur because of daylight saving time. Choose another time.",
    });
    expect(
      materializeCheckInOccurrence({
        periodStartDate: "2028-11-05",
        scheduledLocalTime: "01:30",
        timeZone: "America/New_York",
      }),
    ).toEqual({
      outcome: "needs_reschedule",
      reason: "ambiguous_local_time",
      message: "This local time occurs twice because of daylight saving time. Choose another time.",
    });
  });

  it("recognizes matching submission retries, conflicting payloads, and stale revisions", () => {
    const input = {
      templateVersion: template(),
      occurrence: occurrence(),
      actorProfileId: ids.athlete,
      expectedRevision: 3,
      currentRevision: 3,
      draft: completeDraft(),
      existingSubmission: existingSubmission(),
    };
    expect(decideCheckInSubmission({ ...input, currentRevision: 4 })).toEqual({
      outcome: "replay",
      submissionId: ids.submission,
    });
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: {
          ...input.existingSubmission,
          answers: [
            { questionId: ids.requiredScale, kind: "scale_1_to_10", value: 3 },
            { questionId: ids.feeling, kind: "single_select", choiceId: ids.good },
          ],
        },
      }),
    ).toEqual({ outcome: "conflict", reason: "idempotency_payload_mismatch" });
    expect(
      decideCheckInSubmission({ ...input, existingSubmission: undefined, currentRevision: 4 }),
    ).toEqual({
      outcome: "conflict",
      reason: "stale_revision",
    });
  });

  it("rejects untrustworthy existing evidence and foreign submission identities", () => {
    const input = {
      templateVersion: template(),
      occurrence: occurrence(),
      actorProfileId: ids.athlete,
      expectedRevision: 3,
      currentRevision: 3,
      draft: completeDraft(),
    };
    for (const evidence of [null, false, 0, ""]) {
      expect(decideCheckInSubmission({ ...input, existingSubmission: evidence })).toEqual({
        outcome: "invalid",
        reason: "invalid_existing_evidence",
      });
    }
    for (const evidence of [
      { ...existingSubmission(), occurrenceId: ids.template },
      { ...existingSubmission(), actorProfileId: ids.coach },
      { ...existingSubmission(), templateVersionId: ids.template },
    ]) {
      expect(decideCheckInSubmission({ ...input, existingSubmission: evidence })).toEqual({
        outcome: "conflict",
        reason: "existing_submission_identity_mismatch",
      });
    }
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: { ...existingSubmission(), submissionId: "bad" },
      }),
    ).toEqual({ outcome: "invalid", reason: "invalid_existing_evidence" });
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: {
          ...existingSubmission(),
          answers: [
            ...completeDraft().answers,
            { questionId: ids.template, kind: "long_text", text: "Unknown" },
          ],
        },
      }),
    ).toEqual({ outcome: "invalid", reason: "invalid_existing_evidence" });
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: {
          ...existingSubmission(),
          answers: [
            ...completeDraft().answers,
            { questionId: ids.requiredScale, kind: "scale_1_to_10", value: 7 },
          ],
        },
      }),
    ).toEqual({ outcome: "invalid", reason: "invalid_existing_evidence" });
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: {
          ...existingSubmission(),
          answers: [{ questionId: ids.requiredScale, kind: "scale_1_to_10", value: 11 }],
        },
      }),
    ).toEqual({ outcome: "invalid", reason: "invalid_existing_evidence" });
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: {
          ...existingSubmission(),
          answers: [{ questionId: ids.requiredScale, kind: "scale_1_to_10", value: 7 }],
        },
      }),
    ).toEqual({ outcome: "invalid", reason: "invalid_existing_evidence" });
  });

  it("compares replay evidence semantically and treats optional omission as meaningful", () => {
    const input = {
      templateVersion: template(),
      occurrence: occurrence(),
      actorProfileId: ids.athlete,
      expectedRevision: 3,
      currentRevision: 4,
      draft: {
        ...completeDraft(),
        answers: [
          ...completeDraft().answers,
          { questionId: ids.optionalText, kind: "long_text" as const, text: "Travel Thursday" },
        ],
      },
    };
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: existingSubmission([
          { kind: "long_text", text: "Travel Thursday", questionId: ids.optionalText },
          { value: 7, questionId: ids.requiredScale, kind: "scale_1_to_10" },
          { choiceId: ids.good, kind: "single_select", questionId: ids.feeling },
        ]),
      }),
    ).toEqual({ outcome: "replay", submissionId: ids.submission });
    expect(
      decideCheckInSubmission({
        ...input,
        existingSubmission: existingSubmission(completeDraft().answers),
      }),
    ).toEqual({ outcome: "conflict", reason: "idempotency_payload_mismatch" });
  });

  it("keeps submitted, reviewed, and follow-up states separate", () => {
    const submitted = {
      submissionId: ids.submission,
      revision: 3,
      reviewedAt: null,
      reviewedByProfileId: null,
    };
    expect(getCheckInReviewState(submitted)).toBe("submitted");
    const followUp = createCheckInFollowUp({
      submissionId: ids.submission,
      taskId: ids.task,
      assignedCoachProfileId: ids.coach,
      dueDate: "2028-11-12",
      title: "Adjust travel-week training",
    });
    expect(followUp.submissionId).toBe(submitted.submissionId);
    expect(getCheckInReviewState(submitted)).toBe("submitted");
    expect(
      getCheckInReviewState(
        markCheckInReviewed({
          submission: submitted,
          reviewerProfileId: ids.coach,
          reviewedAt: "2028-11-06T10:00:00.000Z",
        }),
      ),
    ).toBe("reviewed");
  });
});
