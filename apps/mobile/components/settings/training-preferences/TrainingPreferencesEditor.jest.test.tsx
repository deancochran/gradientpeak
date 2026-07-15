import type {
  AthleteTrainingSettings,
  AthleteTrainingSettingsFormInput,
} from "@repo/core/schemas/settings/profile_settings";
import { act, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { Control } from "react-hook-form";
import {
  createHost,
  createFormComponentMocks as mockCreateFormComponentMocks,
} from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const settingsFixture: AthleteTrainingSettings = {
  availability: { weekly_windows: [], hard_rest_days: [] },
  dose_limits: {
    min_sessions_per_week: 2,
    max_sessions_per_week: 6,
    max_single_session_duration_minutes: 180,
    max_weekly_duration_minutes: 420,
  },
  training_style: {
    progression_pace: 0.5,
    week_pattern_preference: 0.5,
    key_session_density_preference: 0.5,
    strength_integration_priority: 0.5,
  },
  recovery_preferences: {
    recovery_priority: 0.5,
    post_goal_recovery_days: 5,
    double_day_tolerance: 0.25,
    long_session_fatigue_tolerance: 0.5,
    systemic_fatigue_tolerance: 0.5,
  },
  adaptation_preferences: {
    recency_adaptation_preference: 0.5,
    plan_churn_tolerance: 0.4,
  },
  goal_strategy_preferences: {
    target_surplus_preference: 0.15,
    priority_tradeoff_preference: 0.5,
    taper_style_preference: 0.5,
  },
  baseline_fitness: {
    is_enabled: false,
    max_weekly_tss_ramp_pct: 10,
    max_ctl_ramp_per_week: 5,
  },
};

const upsertMock = jest.fn(async () => undefined);
const refetchMock = jest.fn(async () => undefined);
const invalidateProfileSettingsMock = jest.fn(async () => undefined);
const invalidateTrainingPlansMock = jest.fn(async () => undefined);

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/form", () => mockCreateFormComponentMocks());

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("./TrainingPreferencesBottomSheet", () => ({
  __esModule: true,
  TrainingPreferencesBottomSheet: ({
    children,
    isSaveDisabled,
    onSave,
  }: {
    children: ReactNode;
    isSaveDisabled: boolean;
    onSave: () => void;
  }) => {
    const React = require("react");
    return React.createElement(
      "TrainingPreferencesBottomSheet",
      {},
      children,
      React.createElement("SaveButton", {
        disabled: isSaveDisabled,
        onPress: onSave,
        testID: "training-preferences-save-button",
      }),
    );
  },
}));

jest.mock("./TrainingPreferencesSurface", () => ({
  __esModule: true,
  TrainingPreferencesSurface: ({
    control,
    onAddAvailabilityWindow,
    onRemoveAvailabilityWindow,
    onToggleAvailabilityDay,
  }: {
    control: Control<AthleteTrainingSettingsFormInput>;
    onAddAvailabilityWindow: (day: "monday") => string | null;
    onRemoveAvailabilityWindow: (day: "monday", index: number) => void;
    onToggleAvailabilityDay: (day: "monday") => void;
  }) => {
    const React = require("react");
    const { useController } = require("react-hook-form");
    const { field } = useController({ control, name: "training_style.progression_pace" });
    const { field: availabilityField } = useController({
      control,
      name: "availability.weekly_windows",
    });
    return React.createElement(
      React.Fragment,
      {},
      React.createElement("SurfaceChange", {
        onPress: () => field.onChange(0.75),
        testID: "training-preferences-test-change",
      }),
      React.createElement("AvailabilityChange", {
        onPress: () =>
          availabilityField.onChange([
            {
              day: "monday",
              max_sessions: 1,
              windows: [{ start_minute_of_day: 360, end_minute_of_day: 1440 }],
            },
          ]),
        testID: "training-preferences-test-availability",
      }),
      React.createElement("InvalidAvailabilityChange", {
        onPress: () =>
          availabilityField.onChange([
            {
              day: "monday",
              max_sessions: 1,
              windows: [{ start_minute_of_day: 360, end_minute_of_day: 360 }],
            },
          ]),
        testID: "training-preferences-test-invalid-availability",
      }),
      React.createElement("UnsortedAvailabilityChange", {
        onPress: () =>
          availabilityField.onChange([
            {
              day: "monday",
              max_sessions: 2,
              windows: [
                { start_minute_of_day: 900, end_minute_of_day: 1080 },
                { start_minute_of_day: 360, end_minute_of_day: 480 },
              ],
            },
          ]),
        testID: "training-preferences-test-unsorted-availability",
      }),
      React.createElement("AddAvailabilityWindow", {
        onPress: () => onAddAvailabilityWindow("monday"),
        testID: "training-preferences-test-add-window",
      }),
      [0, 1, 2].map((index) =>
        React.createElement("RemoveAvailabilityWindow", {
          key: index,
          onPress: () => onRemoveAvailabilityWindow("monday", index),
          testID: `training-preferences-test-remove-window-${index}`,
        }),
      ),
      React.createElement("ToggleAvailabilityDay", {
        onPress: () => onToggleAvailabilityDay("monday"),
        testID: "training-preferences-test-toggle-monday",
      }),
      React.createElement("AvailabilityState", {
        testID: "training-preferences-test-availability-state",
        value: availabilityField.value,
      }),
    );
  },
}));

jest.mock("@/lib/hooks/useProfileSettings", () => ({
  __esModule: true,
  useProfileSettings: () => ({
    profileId: "profile-1",
    settings: settingsFixture,
    isLoading: false,
    refetch: refetchMock,
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      profileSettings: { getForProfile: { invalidate: invalidateProfileSettingsMock } },
      trainingPlans: { invalidate: invalidateTrainingPlansMock },
    }),
    profileSettings: {
      upsert: {
        useMutation: () => ({ isPending: false, mutateAsync: upsertMock }),
      },
    },
  },
}));

const { TrainingPreferencesEditor } = require("./TrainingPreferencesEditor");

describe("TrainingPreferencesEditor persistence ownership", () => {
  beforeEach(() => {
    settingsFixture.availability = { weekly_windows: [], hard_rest_days: [] };
    upsertMock.mockClear();
    refetchMock.mockClear();
    invalidateProfileSettingsMock.mockClear();
    invalidateTrainingPlansMock.mockClear();
  });

  it("keeps full-surface changes in the existing profile-settings save flow", async () => {
    renderNative(<TrainingPreferencesEditor showLauncher={false} />);

    await act(async () => {
      screen.getByTestId("training-preferences-test-change").props.onPress();
    });

    await waitFor(() => {
      expect(screen.getByTestId("training-preferences-save-button").props.disabled).toBe(false);
    });

    await act(async () => {
      await screen.getByTestId("training-preferences-save-button").props.onPress();
    });

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledWith({
        profile_id: "profile-1",
        settings: expect.objectContaining({
          training_style: expect.objectContaining({ progression_pace: 0.75 }),
        }),
      });
      expect(invalidateProfileSettingsMock).toHaveBeenCalled();
      expect(invalidateTrainingPlansMock).toHaveBeenCalled();
      expect(refetchMock).toHaveBeenCalled();
    });
  });

  it("persists availability as numeric minute payloads including the 1440 sentinel", async () => {
    renderNative(<TrainingPreferencesEditor showLauncher={false} />);

    await act(async () =>
      screen.getByTestId("training-preferences-test-availability").props.onPress(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("training-preferences-save-button").props.disabled).toBe(false),
    );
    await act(async () => {
      await screen.getByTestId("training-preferences-save-button").props.onPress();
    });

    expect(upsertMock).toHaveBeenCalledWith({
      profile_id: "profile-1",
      settings: expect.objectContaining({
        availability: expect.objectContaining({
          weekly_windows: [
            {
              day: "monday",
              max_sessions: 1,
              windows: [{ start_minute_of_day: 360, end_minute_of_day: 1440 }],
            },
          ],
        }),
      }),
    });
  });

  it("visibly disables Save when the form is invalid", async () => {
    renderNative(<TrainingPreferencesEditor showLauncher={false} />);

    await act(async () =>
      screen.getByTestId("training-preferences-test-availability").props.onPress(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("training-preferences-save-button").props.disabled).toBe(false),
    );

    await act(async () =>
      screen.getByTestId("training-preferences-test-invalid-availability").props.onPress(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("training-preferences-save-button").props.disabled).toBe(true),
    );
  });

  it("normalizes unsorted defaults and additions use the maximum chronological end", async () => {
    settingsFixture.availability = {
      hard_rest_days: [],
      weekly_windows: [
        {
          day: "monday",
          max_sessions: 2,
          windows: [
            { start_minute_of_day: 900, end_minute_of_day: 1080 },
            { start_minute_of_day: 360, end_minute_of_day: 480 },
          ],
        },
      ],
    };
    renderNative(<TrainingPreferencesEditor showLauncher={false} />);

    expect(screen.getByTestId("training-preferences-test-availability-state").props.value).toEqual([
      {
        day: "monday",
        max_sessions: 2,
        windows: [
          { start_minute_of_day: 360, end_minute_of_day: 480 },
          { start_minute_of_day: 900, end_minute_of_day: 1080 },
        ],
      },
    ]);

    await act(async () => {
      screen.getByTestId("training-preferences-test-unsorted-availability").props.onPress();
      screen.getByTestId("training-preferences-test-add-window").props.onPress();
    });

    expect(screen.getByTestId("training-preferences-test-availability-state").props.value).toEqual([
      expect.objectContaining({
        max_sessions: 2,
        windows: [
          { start_minute_of_day: 360, end_minute_of_day: 480 },
          { start_minute_of_day: 900, end_minute_of_day: 1080 },
          { start_minute_of_day: 1080, end_minute_of_day: 1260 },
        ],
      }),
    ]);
  });

  it.each([
    ["first", 0, [480, 720]],
    ["middle", 1, [360, 720]],
    ["last", 2, [360, 480]],
  ])("removes the %s window while preserving max sessions", async (_position, index, starts) => {
    settingsFixture.availability = {
      hard_rest_days: [],
      weekly_windows: [
        {
          day: "monday",
          max_sessions: 3,
          windows: [
            { start_minute_of_day: 360, end_minute_of_day: 420 },
            { start_minute_of_day: 480, end_minute_of_day: 540 },
            { start_minute_of_day: 720, end_minute_of_day: 780 },
          ],
        },
      ],
    };
    renderNative(<TrainingPreferencesEditor showLauncher={false} />);

    await act(async () =>
      screen.getByTestId(`training-preferences-test-remove-window-${index}`).props.onPress(),
    );

    const [monday] = screen.getByTestId("training-preferences-test-availability-state").props.value;
    expect(monday.max_sessions).toBe(3);
    expect(
      monday.windows.map((window: { start_minute_of_day: number }) => window.start_minute_of_day),
    ).toEqual(starts);
  });

  it("disables a weekday when its last window is removed and restores the default on re-enable", async () => {
    settingsFixture.availability = {
      hard_rest_days: [],
      weekly_windows: [
        {
          day: "monday",
          max_sessions: 3,
          windows: [{ start_minute_of_day: 720, end_minute_of_day: 840 }],
        },
      ],
    };
    renderNative(<TrainingPreferencesEditor showLauncher={false} />);

    await act(async () =>
      screen.getByTestId("training-preferences-test-remove-window-0").props.onPress(),
    );
    expect(screen.getByTestId("training-preferences-test-availability-state").props.value).toEqual(
      [],
    );

    await act(async () =>
      screen.getByTestId("training-preferences-test-toggle-monday").props.onPress(),
    );
    expect(screen.getByTestId("training-preferences-test-availability-state").props.value).toEqual([
      {
        day: "monday",
        max_sessions: 1,
        windows: [{ start_minute_of_day: 360, end_minute_of_day: 540 }],
      },
    ]);
  });
});
