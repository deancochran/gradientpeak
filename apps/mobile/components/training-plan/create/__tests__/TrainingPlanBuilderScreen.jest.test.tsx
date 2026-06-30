import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { publishTrainingPlanGoalCreation } from "@/lib/training-plan-creation/goalCreationHandoff";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import { TrainingPlanBuilderScreen } from "../TrainingPlanBuilderScreen";

const activityPlanCardProps: Array<{
  activity?: unknown;
  activityPlan?: unknown;
}> = [];
const trainingPathChartProps: any[] = [];
const FIXTURE_NOW = new Date(Date.UTC(2026, 5, 15, 12));

function fixtureIsoDate(daysFromNow: number) {
  const date = new Date(FIXTURE_NOW);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function fixtureIsoDateTime(daysFromNow: number) {
  return `${fixtureIsoDate(daysFromNow)}T00:00:00.000Z`;
}

const ACTIVITY_PLAN_CREATED_AT = fixtureIsoDateTime(-165);
const LATEST_WEIGHT_RECORDED_AT = fixtureIsoDateTime(-14);
const RECENT_POWER_EFFORT_RECORDED_AT = fixtureIsoDateTime(-36);
const FUTURE_GOAL_TARGET_DATE = fixtureIsoDate(78);

const activityPlan = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Aerobic builder",
  created_at: ACTIVITY_PLAN_CREATED_AT,
  template_visibility: "public",
  is_public: true,
  is_system_template: false,
  authoritative_metrics: { estimated_tss: 42, estimated_duration: 3600 },
};

let mockPreviewCreationConfigData: unknown;
const mockMutations = {
  create: jest.fn(),
  update: jest.fn(),
  createFromCreationConfig: jest.fn(),
  updateFromCreationConfig: jest.fn(),
};
let mockMutationIndex = 0;

const editableTrainingPlan = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Existing builder plan",
  description: "Edit this plan",
  template_visibility: "private",
  structure: {
    version: 1,
    sessions: [
      {
        offset_days: 0,
        activity_plan_id: activityPlan.id,
        event_overrides: { title: "Existing aerobic day" },
      },
    ],
  },
};

jest.mock("lucide-react-native", () => {
  const Icon = () => React.createElement("Icon");
  return {
    __esModule: true,
    Activity: Icon,
    AlertTriangle: Icon,
    BarChart3: Icon,
    CalendarDays: Icon,
    Check: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Clock: Icon,
    Dumbbell: Icon,
    Flag: Icon,
    Gauge: Icon,
    HelpCircle: Icon,
    Lightbulb: Icon,
    Pencil: Icon,
    Plus: Icon,
    Settings: Icon,
    SlidersHorizontal: Icon,
    Target: Icon,
    User: Icon,
    Zap: Icon,
    X: Icon,
  };
});

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options, ...props }: any) => (
      <View {...props}>
        {options?.headerLeft ? options.headerLeft() : null}
        {options?.headerRight ? options.headerRight() : null}
      </View>
    ),
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, onPress, testID, disabled }: any) => (
    <Pressable disabled={disabled} onPress={onPress} testID={testID}>
      {children}
    </Pressable>
  ),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({ onChangeText, placeholder, testID, value }: any) => (
    <TextInput
      onChangeText={onChangeText}
      placeholder={placeholder}
      testID={testID}
      value={value}
    />
  ),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, testID }: any) => <Text testID={testID}>{children}</Text>,
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: (props: any) => {
    activityPlanCardProps.push({
      activity: props.activity,
      activityPlan: props.activityPlan,
    });
    return (
      <Pressable onPress={props.onPress} testID={props.testID ?? "activity-plan-card"}>
        <Text>{props.activityPlan?.name ?? props.activity?.name}</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/shared/IndexSearchBar", () => ({
  __esModule: true,
  FilterChip: ({ label, onPress, testID }: any) => (
    <Pressable onPress={onPress} testID={testID}>
      <Text>{label}</Text>
    </Pressable>
  ),
  FilterSection: ({ children, title }: any) => (
    <View>
      <Text>{title}</Text>
      {children}
    </View>
  ),
  IndexResultsSummary: ({ count, pluralLabel }: any) => <Text>{`${count} ${pluralLabel}`}</Text>,
  IndexSearchBar: ({ onFilterPress, placeholder, testIDPrefix, value }: any) => (
    <View>
      <TextInput placeholder={placeholder} testID={`${testIDPrefix}-search`} value={value} />
      <Pressable onPress={onFilterPress} testID={`${testIDPrefix}-filter`}>
        <Text>Filters</Text>
      </Pressable>
    </View>
  ),
}));

jest.mock("@/components/shared/IndexFilterSheet", () => ({
  __esModule: true,
  IndexFilterSheet: ({ children, visible }: any) => (visible ? <View>{children}</View> : null),
}));

jest.mock("@/components/plan/training-path/TrainingPathChart", () => ({
  __esModule: true,
  TrainingPathChart: (props: any) => {
    trainingPathChartProps.push(props);
    return <View testID="builder-reactive-impact-chart" />;
  },
}));

jest.mock("@/components/plan/training-path/DailyTrainingAdjustmentChart", () => ({
  __esModule: true,
  DailyTrainingAdjustmentChart: (props: any) => {
    trainingPathChartProps.push(props);
    return <View testID="builder-reactive-impact-chart" />;
  },
}));

jest.mock("../BuilderGoalEditorSheetContent", () => ({
  __esModule: true,
  BuilderGoalEditorContent: ({ goalContext, onCreateLocalGoal }: any) => (
    <View testID="builder-goal-editor-modal">
      <Pressable testID="builder-create-plan-goal" onPress={onCreateLocalGoal}>
        <Text>Create plan goal</Text>
      </Pressable>
      {goalContext.selectedGoals.map((goal: any) => (
        <Text key={goal.localId}>{goal.title}</Text>
      ))}
    </View>
  ),
  BuilderLocalGoalCreateContent: ({ onSave }: any) => (
    <View testID="builder-local-goal-create-form">
      <TextInput placeholder="Finish a 10K, raise FTP, train consistently..." />
      <Pressable
        testID="builder-local-goal-save"
        onPress={() =>
          onSave({
            title: "Finish a local 10K",
            targetOffsetDays: 35,
            priority: 10,
            activityCategory: "run",
            objective: { type: "completion", activity_category: "run", distance_m: 10000 },
          })
        }
      >
        <Text>Add to plan</Text>
      </Pressable>
    </View>
  ),
}));

jest.mock("../BuilderAssumptionsPreferencesForms", () => ({
  __esModule: true,
  BuilderAthleteContextForm: () => <View testID="builder-athlete-context-form" />,
  BuilderPlanPreferencesContextForm: () => <View testID="builder-planning-constraints-form" />,
}));

jest.mock("../BuilderSessionEditorSheetContent", () => ({
  __esModule: true,
  BuilderSessionEditorContent: ({ onOpenActivityPicker, session }: any) => (
    <View testID="builder-session-editor-modal">
      <Pressable
        testID="builder-session-assign-workout"
        onPress={() => onOpenActivityPicker(session.localId)}
      >
        <Text>Assign</Text>
      </Pressable>
    </View>
  ),
}));

jest.mock("../BuilderSchedulePreviewSheetContent", () => ({
  __esModule: true,
  BuilderSchedulePreviewContent: () => <View testID="builder-schedule-preview-modal" />,
}));

jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  AppBottomSheet: ({ children, headerContent, onClose, visible }: any) =>
    visible ? (
      <View testID="training-plan-builder-sheet">
        <Pressable testID="training-plan-builder-sheet-close" onPress={onClose}>
          <Text>Close</Text>
        </Pressable>
        {headerContent}
        {children}
      </View>
    ) : null,
}));

jest.mock("../BuilderStrategyComposer", () => ({
  __esModule: true,
  BuilderStrategyComposer: ({
    onEditMetadata,
    onOpenAthleteContext,
    onOpenGoals,
    onOpenPlanningConstraints,
    state,
  }: any) => (
    <View testID="builder-strategy-composer">
      <Pressable onPress={onEditMetadata}>
        <Text>{state.details.name || "Name your plan"}</Text>
      </Pressable>
      <Pressable onPress={onOpenGoals}>
        <Text>Goals</Text>
      </Pressable>
      <Pressable onPress={onOpenAthleteContext}>
        <Text>Athlete</Text>
      </Pressable>
      <Pressable onPress={onOpenPlanningConstraints}>
        <Text>Preferences</Text>
      </Pressable>
    </View>
  ),
}));

jest.mock("../BuilderScheduleEditor", () => ({
  __esModule: true,
  BuilderScheduleEditor: ({ onAddSessionAtOffset }: any) => (
    <View testID="builder-sessions-workspace">
      <Pressable onPress={() => onAddSessionAtOffset(0)} testID="builder-sessions-workspace-add">
        <Text>Workout</Text>
      </Pressable>
    </View>
  ),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ trainingPlans: {} }),
    profiles: {
      get: {
        useQuery: () => ({
          data: {
            dob: "1998-06-01T00:00:00.000Z",
            full_name: "John Apple",
            gender: "male",
            preferred_units: "metric",
            username: "johnapple",
          },
        }),
      },
    },
    profileMetrics: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                metric_type: "weight_kg",
                value: 72,
                unit: "kg",
                recorded_at: LATEST_WEIGHT_RECORDED_AT,
                notes: null,
                reference_activity_id: null,
              },
            ],
          },
        }),
      },
    },
    activityEfforts: {
      getForProfile: {
        useQuery: () => ({
          data: [
            {
              activity_category: "bike",
              effort_type: "power",
              duration_seconds: 1200,
              value: 285,
              unit: "W",
              recorded_at: RECENT_POWER_EFFORT_RECORDED_AT,
              activity_id: null,
            },
          ],
        }),
      },
    },
    trainingPlans: {
      create: {},
      update: {},
      createFromCreationConfig: {},
      updateFromCreationConfig: {},
      getCurrentStatus: {
        useQuery: () => ({
          data: { ctl: 41, atl: 50, tsb: -9 },
          isLoading: false,
        }),
      },
      previewCreationConfig: {
        useQuery: () => ({
          data: mockPreviewCreationConfigData,
          error: null,
          isFetching: false,
          isLoading: false,
        }),
      },
      get: {
        useQuery: (input: { id?: string } | symbol) => ({
          data: typeof input === "object" && input?.id ? editableTrainingPlan : undefined,
          isLoading: false,
        }),
      },
    },
    goals: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [], nextCursor: undefined, total: 0 }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isError: false,
          isFetching: false,
          isFetchingNextPage: false,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
    },
    activityPlans: {
      getManyByIds: {
        useQuery: () => ({ data: { items: [activityPlan] }, isLoading: false }),
      },
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [activityPlan], nextCursor: undefined }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          isLoading: false,
        }),
      },
    },
  },
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => {
    const keys = [
      "create",
      "update",
      "createFromCreationConfig",
      "updateFromCreationConfig",
    ] as const;
    const key = keys[mockMutationIndex % keys.length];
    mockMutationIndex += 1;
    return { isPending: false, mutateAsync: mockMutations[key] };
  },
}));

jest.mock("@/lib/hooks/useDebouncedValue", () => ({
  __esModule: true,
  useDebouncedValue: (value: unknown) => value,
}));

describe("TrainingPlanBuilderScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXTURE_NOW);
    activityPlanCardProps.length = 0;
    trainingPathChartProps.length = 0;
    mockPreviewCreationConfigData = undefined;
    mockMutationIndex = 0;
    for (const mutation of Object.values(mockMutations)) {
      mutation.mockReset();
      mutation.mockResolvedValue({ id: "created-plan" });
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens plan metadata editing from the main composer", () => {
    renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByTestId("builder-strategy-composer")).toBeTruthy();
    fireEvent.press(screen.getByText("Name your plan"));

    expect(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("What this plan is designed to do")).toBeTruthy();
  });

  it("opens builder-local goals off the main composer", () => {
    renderNative(<TrainingPlanBuilderScreen />);

    fireEvent.press(screen.getByText("Goals"));

    expect(screen.getByTestId("builder-goal-editor-modal")).toBeTruthy();
  });

  it("creates a full plan-local goal without using profile goal creation", () => {
    renderNative(<TrainingPlanBuilderScreen />);

    fireEvent.press(screen.getByText("Goals"));
    fireEvent.press(screen.getByTestId("builder-create-plan-goal"));

    expect(screen.getByTestId("builder-local-goal-create-form")).toBeTruthy();
    fireEvent.changeText(
      screen.getByPlaceholderText("Finish a 10K, raise FTP, train consistently..."),
      "Finish a local 10K",
    );
    fireEvent.press(screen.getByTestId("builder-local-goal-save"));

    expect(screen.getByTestId("builder-goal-editor-modal")).toBeTruthy();
    expect(screen.getAllByText("Finish a local 10K").length).toBeGreaterThan(0);
  });

  it("opens profile, metrics, and efforts from one athlete context form", () => {
    renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByText("Athlete")).toBeTruthy();

    fireEvent.press(screen.getByText("Athlete"));

    expect(screen.getByTestId("builder-athlete-context-form")).toBeTruthy();
  });

  it("opens sparse planning constraints off the main composer", () => {
    renderNative(<TrainingPlanBuilderScreen />);

    fireEvent.press(screen.getByText("Preferences"));

    expect(screen.getByTestId("builder-planning-constraints-form")).toBeTruthy();
  });

  it("opens plan settings with start date controls from the strategy composer", () => {
    renderNative(<TrainingPlanBuilderScreen />);

    fireEvent.press(screen.getByText("Name your plan"));

    expect(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("YYYY-MM-DD")).toBeTruthy();
  });

  it("opens activity assignment from the schedule editor", () => {
    renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByTestId("builder-sessions-workspace")).toBeTruthy();

    fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));

    expect(screen.getByTestId("training-plan-builder-activity-picker-search")).toBeTruthy();
    expect(screen.getByTestId("training-plan-builder-activity-picker-filter")).toBeTruthy();
    expect(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`));

    expect(screen.getByTestId("builder-session-editor-modal")).toBeTruthy();
  });

  it("routes create through backend creation-config when preview snapshot is available", async () => {
    mockPreviewCreationConfigData = {
      projection_chart: { readiness_score: 80, display_points: [] },
      preview_snapshot: { token: "snapshot-token" },
    };
    renderNative(<TrainingPlanBuilderScreen />);

    act(() =>
      publishTrainingPlanGoalCreation({
        id: "profile-goal-1",
        title: "Raise FTP",
        target_date: FUTURE_GOAL_TARGET_DATE,
        priority: 10,
        activity_category: "bike",
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 310,
          test_duration_s: 1200,
        },
      }),
    );
    fireEvent.press(screen.getByText("Name your plan"));
    fireEvent.changeText(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
      "FTP build",
    );
    fireEvent.press(screen.getByTestId("training-plan-builder-sheet-close"));
    fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));
    fireEvent.press(screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`));
    fireEvent.press(screen.getByTestId("training-plan-builder-sheet-close"));
    await waitFor(() => {
      expect(screen.getByText("Create")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockMutations.createFromCreationConfig).toHaveBeenCalledTimes(1);
    });
    expect(mockMutations.create).not.toHaveBeenCalled();
  });

  it("falls back to legacy create when backend preview snapshot is unavailable", async () => {
    renderNative(<TrainingPlanBuilderScreen />);

    act(() =>
      publishTrainingPlanGoalCreation({
        id: "profile-goal-1",
        title: "Raise FTP",
        target_date: FUTURE_GOAL_TARGET_DATE,
        priority: 10,
        activity_category: "bike",
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 310,
          test_duration_s: 1200,
        },
      }),
    );
    fireEvent.press(screen.getByText("Name your plan"));
    fireEvent.changeText(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
      "FTP build",
    );
    fireEvent.press(screen.getByTestId("training-plan-builder-sheet-close"));
    fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));
    fireEvent.press(screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`));
    fireEvent.press(screen.getByTestId("training-plan-builder-sheet-close"));
    await waitFor(() => {
      expect(screen.getByText("Create")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockMutations.create).toHaveBeenCalledTimes(1);
    });
    expect(mockMutations.createFromCreationConfig).not.toHaveBeenCalled();
  });

  it("hydrates edit mode into the new builder save flow", async () => {
    renderNative(
      <TrainingPlanBuilderScreen mode="edit" planId="22222222-2222-4222-8222-222222222222" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeTruthy();
      expect(screen.getByText("Existing builder plan")).toBeTruthy();
    });
  });
});
