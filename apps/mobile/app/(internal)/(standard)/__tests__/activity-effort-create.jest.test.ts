import { activityEffortCreateInputSchema } from "@repo/core/schemas";
import type { ReactNode } from "react";
import { fireEvent, renderNative } from "../../../../test/render-native";

let mockEditedRecordedAt: string | undefined;
const formDateTimeFieldMock = jest.fn(
  (props: { control?: { setRecordedAt?: (value: string) => void }; testId?: string }) =>
    require("react").createElement(require("react-native").Pressable, {
      onPress: () => {
        if (mockEditedRecordedAt) props.control?.setRecordedAt?.(mockEditedRecordedAt);
      },
      testID: props.testId,
    }),
);
const useZodFormMock = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
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
  FormDateTimeField: (props: Parameters<typeof formDateTimeFieldMock>[0]) =>
    formDateTimeFieldMock(props),
  FormNumberField: () => null,
  FormSegmentedSelectField: () => null,
}));
jest.mock("@repo/ui/components/pace-input", () => ({ __esModule: true, PaceInput: () => null }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: () => null }));
jest.mock("@repo/ui/hooks", () => ({
  __esModule: true,
  useZodForm: (options: unknown) => useZodFormMock(options),
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

function formatLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

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

  it("interprets swim pace per 100 meters", () => {
    const submission = prepareActivityEffortSubmission(
      {
        ...speedEffort,
        activity_category: "swim",
        speed_entry_mode: "pace",
      },
      "1:40",
    );

    expect(submission.effort).toMatchObject({
      activity_category: "swim",
      duration_seconds: 1200,
      value: 1,
    });
  });
});

describe("activity effort recorded time", () => {
  afterEach(() => {
    jest.useRealTimers();
    mockEditedRecordedAt = undefined;
  });

  it("defaults to now and renders an editable semantic date-time field", () => {
    const now = new Date("2026-07-13T12:34:56.000Z");
    jest.useFakeTimers().setSystemTime(now);
    useZodFormMock.mockReturnValue({
      control: {},
      getValues: jest.fn(() => 250),
      setValue: jest.fn(),
      watch: jest.fn((name: string) =>
        name === "activity_category" ? "bike" : name === "effort_type" ? "power" : "direct",
      ),
    });
    const { useZodFormSubmit } = require("@repo/ui/hooks");
    (useZodFormSubmit as jest.Mock).mockReturnValue({
      getSubmitButtonState: () => ({ disabled: false, label: "Save" }),
      handleSubmit: jest.fn(),
      isSubmitting: false,
    });
    const { api } = require("@/lib/api");
    api.useUtils = () => ({
      activityEfforts: { invalidate: jest.fn() },
      activities: { invalidate: jest.fn() },
      events: { invalidate: jest.fn() },
      trainingPlans: { invalidate: jest.fn() },
    });
    api.activityEfforts = {
      create: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
    };

    const ActivityEffortCreate = require("../activity-effort-create").default;
    renderNative(require("react").createElement(ActivityEffortCreate));

    expect(useZodFormMock.mock.calls[0][0].defaultValues.recorded_at).toBe(
      formatLocalDateTime(now),
    );
    expect(formDateTimeFieldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dateLabel: "Recorded date",
        disabled: false,
        label: "Recorded",
        name: "recorded_at",
        testId: "activity-effort-recorded-at",
        timeLabel: "Recorded time",
      }),
    );
  });

  it("converts an edited local wall-clock value to a timezone-qualified mutation payload", async () => {
    mockEditedRecordedAt = "2026-01-15T09:45";
    let formValues: Record<string, unknown> = {};
    let submitOptions: { onSubmit: (data: Record<string, unknown>) => Promise<void> } | undefined;
    const mutateAsync = jest.fn().mockResolvedValue(undefined);

    useZodFormMock.mockImplementation((options: { defaultValues: Record<string, unknown> }) => {
      formValues = { ...options.defaultValues };
      return {
        control: {
          setRecordedAt: (value: string) => {
            formValues.recorded_at = value;
          },
        },
        getValues: jest.fn((name: string) => formValues[name]),
        setError: jest.fn(),
        setValue: jest.fn((name: string, value: unknown) => {
          formValues[name] = value;
        }),
        watch: jest.fn((name: string) => formValues[name]),
      };
    });
    const { useZodFormSubmit } = require("@repo/ui/hooks");
    (useZodFormSubmit as jest.Mock).mockImplementation((options: unknown) => {
      submitOptions = options as {
        onSubmit: (data: Record<string, unknown>) => Promise<void>;
      };
      return {
        getSubmitButtonState: () => ({ disabled: false, label: "Save" }),
        handleSubmit: jest.fn(),
        isSubmitting: false,
      };
    });
    const { api } = require("@/lib/api");
    api.useUtils = () => ({
      activityEfforts: { invalidate: jest.fn() },
      activities: { invalidate: jest.fn() },
      events: { invalidate: jest.fn() },
      trainingPlans: { invalidate: jest.fn() },
    });
    api.activityEfforts = {
      create: { useMutation: () => ({ isPending: false, mutateAsync }) },
    };

    const ActivityEffortCreate = require("../activity-effort-create").default;
    const rendered = renderNative(require("react").createElement(ActivityEffortCreate));
    fireEvent.press(rendered.getByTestId("activity-effort-recorded-at"));
    expect(formValues.recorded_at).toBe(mockEditedRecordedAt);

    await submitOptions?.onSubmit(formValues);

    expect(mutateAsync).toHaveBeenCalledWith({
      activity_category: "bike",
      duration_seconds: 1200,
      effort_type: "power",
      recorded_at: new Date(mockEditedRecordedAt).toISOString(),
      value: 250,
    });
    const payload = mutateAsync.mock.calls[0][0] as { recorded_at: string };
    expect(payload.recorded_at).toMatch(/Z$/);
    expect(activityEffortCreateInputSchema.safeParse(payload).success).toBe(true);
  });
});
