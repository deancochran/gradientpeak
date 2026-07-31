// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrainingLoadPath } from "./training-load-path";

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
                commonLoad: {
                  status: "complete",
                  model: "gradientpeak_relative_load",
                  version: "1",
                  contributingDurationSeconds: 3600,
                  knownDurationSeconds: 3600,
                  contributingActivityCount: 1,
                  partialActivityCount: 0,
                  unavailableActivityCount: 0,
                  totalActivityCount: 1,
                  activityCountCoverage: 1,
                  knownDurationCoverage: 1,
                  unknownDurationActivityCount: 0,
                  load: 100,
                  intensity: 1,
                },
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
    expect(screen.getByText("Load 100")).toBeTruthy();
  });
});
