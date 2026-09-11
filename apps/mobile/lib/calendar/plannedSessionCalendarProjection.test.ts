import { createHash } from "node:crypto";
import { plannedSessionDtoSchema } from "@repo/api/client";
import {
  type CalendarProjectionItem,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import { buildPlannedSessionRecordingLaunchPayload } from "../recording/plannedSessionLaunch";
import { mergeDirectPlannedSessionsIntoCalendar } from "./plannedSessionCalendarProjection";

vi.mock("expo-crypto", async () => {
  const { createHash } = await import("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: async (_algorithm: string, value: string) =>
      createHash("sha256").update(value).digest("hex"),
  };
});

const prescribedStructure = {
  version: 3 as const,
  activity_category: "bike" as const,
  segments: [
    {
      id: "10000000-0000-4000-8000-000000000007",
      role: "activity" as const,
      name: "Ride",
      intervals: [
        {
          id: "10000000-0000-4000-8000-000000000008",
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: "10000000-0000-4000-8000-000000000009",
              name: "Steady",
              duration: { type: "time" as const, seconds: 1_800 },
              targets: [{ type: "RPE" as const, intensity: 7 }],
            },
          ],
        },
      ],
    },
  ],
};
const prescribedStructureHash = `v1:sha256:${createHash("sha256")
  .update(getCanonicalActivityPlanStructureHashInput(prescribedStructure))
  .digest("hex")}`;
const prescription = {
  activityPlanId: "10000000-0000-4000-8000-000000000001",
  activityPlanRevision: 2,
  variantId: "10000000-0000-4000-8000-000000000006",
  variantName: "Hard",
  structure: prescribedStructure,
  structureHash: prescribedStructureHash,
  prescriptionQuantification: null,
  capturedAt: "2026-09-11T12:00:00.000Z",
};

function directSession(id: string, groupEventId?: string) {
  return plannedSessionDtoSchema.parse({
    id,
    profileId: "10000000-0000-4000-8000-000000000002",
    sessionRevision: 1,
    planningDate: "2026-09-15",
    originalTargetDate: "2026-09-15",
    source: { kind: "direct", operationId: "direct_operation_1234567890123456" },
    groupEventId: groupEventId ?? null,
    prescription,
    lifecycle: { status: "scheduled" },
  });
}

describe("mergeDirectPlannedSessionsIntoCalendar", () => {
  it("projects direct sessions with their immutable prescribed variant", () => {
    const session = directSession("10000000-0000-4000-8000-000000000003");
    const [item] = mergeDirectPlannedSessionsIntoCalendar({
      items: [],
      sessions: [session],
      timezone: "UTC",
    });

    expect(item).toMatchObject({
      id: session.id,
      kind: "planned_activity",
      title: "Hard",
      plannedSession: {
        prescription: { variantId: "10000000-0000-4000-8000-000000000006" },
      },
    });
  });

  it("builds direct launches only from the immutable prescribed revision and variant", async () => {
    const session = directSession("10000000-0000-4000-8000-000000000003");
    const payload = await buildPlannedSessionRecordingLaunchPayload({
      plannedSession: {
        id: session.id,
        sessionRevision: session.sessionRevision,
        prescription: session.prescription,
      },
    });

    expect(payload).toMatchObject({
      activity_category: "bike",
      plan: {
        id: prescription.activityPlanId,
        structure: prescription.structure,
      },
      plannedSession: {
        id: session.id,
        sessionRevision: session.sessionRevision,
        prescription,
      },
    });
  });

  it("rejects a forged prescription hash before creating a launch payload", async () => {
    const session = directSession("10000000-0000-4000-8000-000000000003");
    await expect(
      buildPlannedSessionRecordingLaunchPayload({
        plannedSession: {
          id: session.id,
          sessionRevision: session.sessionRevision,
          prescription: { ...session.prescription, structureHash: `v1:sha256:${"0".repeat(64)}` },
        },
      }),
    ).rejects.toThrow("Invalid planned-session prescription structure hash");
  });

  it("does not duplicate sessions already represented by events or group events", () => {
    const session = directSession("10000000-0000-4000-8000-000000000003");
    const grouped = directSession(
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000005",
    );
    const represented = {
      id: "event-1",
      calendarDate: "2026-09-15",
      timing: { startsAt: null, endsAt: null, allDay: true, timezone: "UTC" },
      kind: "planned_activity",
      plannedSession: {
        id: session.id,
      },
    } as CalendarProjectionItem;
    const groupEvent = {
      id: grouped.groupEventId,
      calendarDate: "2026-09-15",
      timing: { startsAt: null, endsAt: null, allDay: true, timezone: "UTC" },
      kind: "group_event",
      plannedSession: null,
    } as CalendarProjectionItem;

    const result = mergeDirectPlannedSessionsIntoCalendar({
      items: [represented, groupEvent],
      sessions: [session, grouped],
      timezone: "UTC",
    });
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([represented, groupEvent]));
  });
});
