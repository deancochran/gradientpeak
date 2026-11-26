import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
// @vitest-environment jsdom
import { ActivityPlanEditSession } from "./activity-plan-edit-session";

describe("ActivityPlanEditSession", () => {
  it("renders the frozen V5 document", () => {
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "run",
      items: [
        {
          type: "step",
          id: "22222222-2222-4222-8222-222222222222",
          duration: { type: "time", seconds: 60 },
          targets: [],
        },
      ],
    });
    render(
      <ActivityPlanEditSession
        edit={{
          id: "33333333-3333-4333-8333-333333333333",
          name: "Run",
          description: null,
          notes: null,
          structure,
          structureHash: "hash",
          activityPlanRevision: 1,
          gpsRecordingEnabled: true,
          contentVisibility: "private",
          trainingIntent: "general_maintenance",
        }}
        onCancel={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.queryByText("Block 1")).toBeNull();
    expect(screen.getAllByText("Step 1").length).toBeGreaterThan(0);
  });
});
