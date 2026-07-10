import type { ReactNode } from "react";

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/duration-input", () => ({
  __esModule: true,
  DurationInput: () => null,
}));
jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: { children: ReactNode }) => children,
  FormBoundedNumberField: () => null,
  FormNumberField: () => null,
  FormSegmentedSelectField: () => null,
}));
jest.mock("@repo/ui/components/pace-input", () => ({ __esModule: true, PaceInput: () => null }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: () => null }));
jest.mock("@repo/ui/hooks", () => ({
  __esModule: true,
  useZodForm: jest.fn(),
  useZodFormSubmit: jest.fn(),
}));
jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
  ScreenErrorFallback: () => null,
}));
jest.mock("@/lib/api", () => ({ __esModule: true, api: {} }));
jest.mock("@/lib/utils/formErrors", () => ({
  __esModule: true,
  handleSubmitFormError: jest.fn(),
}));

import { prepareActivityEffortSubmission } from "../activity-effort-create";

const speedEffort = {
  activity_category: "run" as const,
  effort_type: "speed" as const,
  duration_seconds: 1200,
  value: 99,
  recorded_at: "2026-07-09T00:00:00.000Z",
  speed_entry_mode: "distance_elapsed" as const,
  distance_meters: 1000,
  elapsed_duration: "0:10:00",
};

describe("activity effort submission", () => {
  it("derives duration and speed from the valid distance and elapsed time at submission", () => {
    const submission = prepareActivityEffortSubmission(speedEffort, "");

    expect(submission.error).toBeUndefined();
    expect(submission.effort).toEqual({
      activity_category: "run",
      effort_type: "speed",
      duration_seconds: 600,
      value: 1000 / 600,
      recorded_at: "2026-07-09T00:00:00.000Z",
    });
  });

  it("rejects cleared or invalid distance-time entries instead of submitting stale values", () => {
    expect(
      prepareActivityEffortSubmission(
        { ...speedEffort, distance_meters: undefined, elapsed_duration: "" },
        "",
      ),
    ).toEqual({ error: "Enter a valid distance and elapsed time." });
  });

  it("derives speed from a valid pace and rejects incomplete pace drafts", () => {
    const valid = prepareActivityEffortSubmission(
      { ...speedEffort, speed_entry_mode: "pace" },
      "4:00",
    );

    expect(valid.effort).toEqual({
      activity_category: "run",
      effort_type: "speed",
      duration_seconds: 1200,
      value: 1000 / 240,
      recorded_at: "2026-07-09T00:00:00.000Z",
    });
    expect(
      prepareActivityEffortSubmission({ ...speedEffort, speed_entry_mode: "pace" }, "4:"),
    ).toEqual({ error: "Enter a valid pace." });
  });
});
