// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createActivityQuantificationBundle } from "../../test-support/activity-quantification";

import { TrainingLoadPath } from "./training-load-path";

const quantification = createActivityQuantificationBundle({
  id: "plan-1",
  load: 100,
  nativeIntensity: 100,
});

describe("TrainingLoadPath", () => {
  it("exposes scheduled firm rows by their scheduled item ID", () => {
    render(
      <TrainingLoadPath
        effectiveLoad={{
          status: "available",
          sourceCoverage: {
            activities: { status: "complete" },
            scheduledItems: { status: "complete" },
          },
          effective: {
            status: "available",
            firmItems: [
              {
                date: "2026-07-25",
                kind: "scheduled",
                scheduledItemId: "00000000-0000-4000-8000-000000000001",
                commonLoad: quantification.summary.commonLoad,
                prescriptionQuantification: quantification,
              },
            ],
          },
        }}
      />,
    );

    const item = document.querySelector(
      '[data-scheduled-item-id="00000000-0000-4000-8000-000000000001"]',
    );
    expect(item).toBeTruthy();
    expect(screen.getByText("Common Load 100")).toBeTruthy();
  });
});
