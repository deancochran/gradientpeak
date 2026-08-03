import {
  activityPlanStructureSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";
import { describe, expect, it } from "vitest";

import { resolvePlannedActivityQuantification } from "./resolve-planned-common-load";

const structure = activityPlanStructureSchema.parse({
  version: 3,
  segments: [
    {
      role: "activity",
      id: "70000000-0000-4000-8000-000000000001",
      name: "Scheduled bike",
      activity_category: "bike",
      intervals: [
        {
          id: "70000000-0000-4000-8000-000000000002",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "70000000-0000-4000-8000-000000000003",
              name: "Steady",
              duration: { type: "time", seconds: 1_800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
});

describe("resolvePlannedActivityQuantification", () => {
  it("uses persisted scheduled event identity without contaminating plan or calculation identity", () => {
    const asOf = new Date("2026-07-31T12:00:00.000Z");
    const performanceTargets = createUnavailableAthletePerformanceTargetFacts(asOf.toISOString());
    const first = resolvePlannedActivityQuantification({
      asOf,
      planId: "plan-1",
      structure,
      performanceTargets,
      stage: "scheduled",
      scheduledEventId: "event-1",
    });
    const second = resolvePlannedActivityQuantification({
      asOf,
      planId: "plan-1",
      structure,
      performanceTargets,
      stage: "scheduled",
      scheduledEventId: "event-2",
    });
    const firstMember = first.prescriptionQuantification.members[0];
    const secondMember = second.prescriptionQuantification.members[0];
    expect(firstMember).toBeDefined();
    expect(secondMember).toBeDefined();
    if (!firstMember || !secondMember) throw new Error("Expected quantified plan members");

    expect(firstMember.subjectIdentity).toMatchObject({
      subjectType: "plan_occurrence",
      parentSubjectIdentity: {
        subjectType: "scheduled_event",
        eventId: "event-1",
        planSubjectIdentity: { planId: "plan-1" },
      },
    });
    expect(secondMember.subjectIdentity).toMatchObject({
      subjectType: "plan_occurrence",
      parentSubjectIdentity: {
        subjectType: "scheduled_event",
        eventId: "event-2",
        planSubjectIdentity: { planId: "plan-1" },
      },
    });
    expect(firstMember.subjectIdentity.fingerprint).not.toBe(
      secondMember.subjectIdentity.fingerprint,
    );
    expect(firstMember.evidenceIdentity).toEqual(secondMember.evidenceIdentity);
    expect(firstMember.calculationIdentity).toEqual(secondMember.calculationIdentity);
    expect(firstMember.commonLoad).toEqual(secondMember.commonLoad);
    expect(first.prescriptionQuantification.summary).toMatchObject({
      summaryScope: "components",
      subjectIdentity: { subjectType: "scheduled_event", eventId: "event-1" },
      memberSubjectIdentities: [{ subjectType: "plan_occurrence" }],
    });
  });
});
