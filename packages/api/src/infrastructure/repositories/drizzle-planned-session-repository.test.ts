import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import type { PlannedSessionRow } from "@repo/db";
import { describe, expect, it } from "vitest";
import { mapPlannedSessionRow } from "./drizzle-planned-session-repository";

const linkedAt = new Date("2026-08-01T12:00:00.000Z");
const unlinkedAt = new Date("2026-08-02T12:00:00.000Z");
const prescriptionStructure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      role: "activity",
      name: "Ride",
      intervals: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              name: "Steady",
              duration: { type: "time", seconds: 1800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
});
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  profile_id: "22222222-2222-4222-8222-222222222222",
  contract_version: "planned-session-v1",
  session_revision: 3,
  planning_date: "2026-08-03",
  original_target_date: "2026-08-01",
  source_kind: "direct",
  idempotency_key: "direct:direct_planned_session_operation_1",
  direct_operation_id: "direct_planned_session_operation_1",
  training_plan_id: null,
  training_plan_revision: null,
  source_session_key: null,
  series_id: null,
  occurrence_key: null,
  group_event_id: null,
  activity_plan_id: "33333333-3333-4333-8333-333333333333",
  activity_plan_revision: 1,
  prescription_structure: prescriptionStructure,
  prescription_quantification: null,
  prescription_captured_at: linkedAt,
  status: "completed",
  cancellation_reason: null,
  cancelled_at: null,
  completed_activity_id: null,
  completion_state: "activity_deleted",
  linked_at: linkedAt,
  completion_unlinked_at: unlinkedAt,
  created_at: linkedAt,
  updated_at: unlinkedAt,
} satisfies PlannedSessionRow;

describe("planned-session Drizzle mapper", () => {
  it("preserves original scheduling and completion history after activity unlink", () => {
    expect(mapPlannedSessionRow(row)).toMatchObject({
      id: row.id,
      profileId: row.profile_id,
      sessionRevision: 3,
      planningDate: "2026-08-03",
      originalTargetDate: "2026-08-01",
      source: { kind: "direct", operationId: row.direct_operation_id },
      lifecycle: {
        status: "completed",
        completion: {
          state: "activity_deleted",
          linkedAt: linkedAt.toISOString(),
          unlinkedAt: unlinkedAt.toISOString(),
        },
      },
    });
  });

  it("rejects malformed source and date rows rather than returning persistence data", () => {
    expect(() => mapPlannedSessionRow({ ...row, direct_operation_id: "short" })).toThrow();
    expect(() => mapPlannedSessionRow({ ...row, planning_date: "08/03/2026" })).toThrow();
  });
});
