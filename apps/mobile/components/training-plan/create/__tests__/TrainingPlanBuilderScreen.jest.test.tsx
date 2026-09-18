import {
  athleteStateBaselineSchema,
  createAthletePlanningContextFromSnapshot,
  createUnavailableAthletePerformanceTargetFacts,
  simulateTrainingPlan,
} from "@repo/core";
import React from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { publishTrainingPlanGoalCreation } from "@/lib/training-plan-creation/goalCreationHandoff";
import { createActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import { TrainingPlanBuilderScreen } from "../TrainingPlanBuilderScreen";
import { getBuilderSheetPresentation } from "../TrainingPlanBuilderSheets";

const activityPlanCardProps: Array<{
  plan?: { name?: string };
}> = [];
const trainingPathChartProps: unknown[] = [];
const preventRemoveMock = jest.fn();
const dispatchMock = jest.fn();
// Keep the application sheet/frame/provider real; only replace the native presentation driver.
jest.mock("@gorhom/bottom-sheet", () => {
  const React: typeof import("react") = require("react");
  const { View, ScrollView, FlatList } = require("react-native");
  return {
    BottomSheetModal: React.forwardRef(
      (
        {
          children,
          footerComponent: Footer,
          ...props
        }: React.PropsWithChildren<{
          footerComponent?: React.ComponentType;
        }>,
        ref: React.ForwardedRef<{ present: () => void; dismiss: () => void }>,
      ) => {
        React.useImperativeHandle(ref, () => ({ present() {}, dismiss() {} }));
        return (
          <View {...props}>
            {children}
            {Footer ? <Footer /> : null}
          </View>
        );
      },
    ),
    BottomSheetScrollView: ScrollView,
    BottomSheetFlatList: FlatList,
    BottomSheetView: View,
    BottomSheetFooter: View,
    BottomSheetBackdrop: View,
  };
});
jest.mock("../BuilderProjectionOverview", () => ({
  BuilderProjectionOverview: ({
    renderBelowChart,
  }: {
    renderBelowChart?: (context: { selectedDayPoint: null }) => React.ReactNode;
  }) => <View>{renderBelowChart?.({ selectedDayPoint: null })}</View>,
}));
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (...args: unknown[]) => preventRemoveMock(...args),
}));
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

const activityPlan = createActivityPlanSummary({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Aerobic builder",
  createdAt: ACTIVITY_PLAN_CREATED_AT,
  visibility: "public",
});

let mockAuthoritativePreviewData: unknown;
let mockAuthoritativePreviewError: Error | null;
let mockEditPlanError: Error | null;
let mockPerformanceModelError: Error | null;
let mockQueryRefresh = 0;
const mockContextRefetch = {
  profile: jest.fn(),
  profileMetrics: jest.fn(),
  activityEfforts: jest.fn(),
  performanceTargets: jest.fn(),
};
const mockProjectionRefetch = {
  baseline: jest.fn(),
};
const mockInvalidateProjectionPlanView = jest.fn();
const mockMutations = {
  create: jest.fn(),
  update: jest.fn(),
};

const editableTrainingPlan = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Existing builder plan",
  description: "Edit this plan",
  content_visibility: "private",
  revision: 1,
  structure_hash: `v1:sha256:${"a".repeat(64)}`,
  editor: {
    revision: 1,
    structureHash: `v1:sha256:${"a".repeat(64)}`,
  },
  structure: {
    id: "22222222-2222-4222-8222-222222222222",
    version: 1,
    plan_preferences: {
      weekly_session_count: 1,
      target_weekly_duration_minutes: 60,
      maximum_session_duration_minutes: 90,
      preferred_weekdays: [1],
      rest_days: [0, 2, 3, 4, 5, 6],
      progression_style: "balanced",
      recovery_priority: "balanced",
    },
    sessions: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        offset_days: 0,
        activity_plan_id: activityPlan.id,
        demand: {
          activity_category: "bike",
          training_intent: "aerobic_base",
          target_duration_minutes: 60,
          target_common_load: 40,
          importance: "normal",
        },
        event_overrides: { title: "Existing aerobic day" },
      },
    ],
  },
};
const projectionBaseline = {
  contractVersion: "athlete-read-model-v1" as const,
  profileId: "44444444-4444-4444-8444-444444444444",
  asOf: FIXTURE_NOW.toISOString(),
  publishedRevision: 7,
  algorithmVersion: "athlete-state-projection-v1",
  status: {
    freshness: "fresh" as const,
    rebuildStatus: "fresh" as const,
    importStatus: "complete" as const,
  },
  publishedState: {
    publishedAt: FIXTURE_NOW.toISOString(),
  },
  currentBaseline: {
    planningTimezone: "UTC",
    currentPlanningDate: "2026-06-01",
    baseline: athleteStateBaselineSchema.parse({
      contractVersion: "athlete-state-projection-v1",
      athleteId: "44444444-4444-4444-8444-444444444444",
      stateRevision: 7,
      asOf: FIXTURE_NOW.toISOString(),
      longTermLoad: 41,
      recentLoad: 50,
      loadBalance: -9,
      evidenceConfidence: 0.8,
      capabilities: [],
      athleteAgeYears: 28,
    }),
    planningContext: null as unknown,
  },
};
const authoritativeSimulation = simulateTrainingPlan({
  baseline: projectionBaseline.currentBaseline.baseline,
  plannedSessions: [
    {
      kind: "projected",
      sourceId: "plan:sessions.0",
      scheduledAt: FIXTURE_NOW.toISOString(),
      activityCategory: "bike",
      commonLoad: 70,
    },
  ],
  simulationAt: FIXTURE_NOW.toISOString(),
  planningTimezone: "UTC",
  goal: null,
});
const creationContext = {
  asOf: FIXTURE_NOW.toISOString(),
  profileId: "44444444-4444-4444-8444-444444444444",
  planningTimezone: "UTC",
  athleteContext: createAthletePlanningContextFromSnapshot({
    asOf: FIXTURE_NOW.toISOString(),
    profile: {
      dob: "1998-06-01T00:00:00.000Z",
      gender: "male",
      preferred_units: "metric",
    },
    profileMetrics: [
      {
        metric_type: "weight_kg",
        value: 72,
        unit: "kg",
        recorded_at: LATEST_WEIGHT_RECORDED_AT,
      },
    ],
    activityEfforts: [],
    currentFitness: {
      longTermLoad: 41,
      recentLoad: 50,
      loadBalance: -9,
      recorded_at: FIXTURE_NOW.toISOString(),
    },
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(FIXTURE_NOW.toISOString()),
  }),
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
    ChevronDown: Icon,
    ChevronDownIcon: Icon,
    ChevronUpIcon: Icon,
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
    Screen: ({
      options,
      ...props
    }: React.ComponentProps<typeof View> & {
      options?: { headerLeft?: () => React.ReactNode; headerRight?: () => React.ReactNode };
    }) => (
      <View {...props}>
        {options?.headerLeft ? options.headerLeft() : null}
        {options?.headerRight ? options.headerRight() : null}
      </View>
    ),
  },
  useNavigation: () => ({ dispatch: dispatchMock }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({
    children,
    onPress,
    testID,
    disabled,
    ...props
  }: React.ComponentProps<typeof Pressable>) => (
    <Pressable disabled={disabled} onPress={onPress} testID={testID} {...props}>
      {children}
    </Pressable>
  ),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: (props: React.ComponentProps<typeof TextInput>) => <TextInput {...props} />,
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, testID }: React.ComponentProps<typeof Text>) => (
    <Text testID={testID}>{children}</Text>
  ),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: (props: {
    plan?: { name?: string };
    onPress?: () => void;
    testID?: string;
  }) => {
    activityPlanCardProps.push({
      ...(props.plan === undefined ? {} : { plan: props.plan }),
    });
    return (
      <Pressable onPress={props.onPress} testID={props.testID ?? "activity-plan-card"}>
        <Text>{props.plan?.name}</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/shared/IndexSearchBar", () => ({
  __esModule: true,
  FilterChip: ({
    label,
    onPress,
    testID,
  }: {
    label: string;
    onPress?: () => void;
    testID?: string;
  }) => (
    <Pressable onPress={onPress} testID={testID}>
      <Text>{label}</Text>
    </Pressable>
  ),
  FilterSection: ({ children, title }: { children?: React.ReactNode; title: string }) => (
    <View>
      <Text>{title}</Text>
      {children}
    </View>
  ),
  IndexResultsSummary: ({ count, pluralLabel }: { count: number; pluralLabel: string }) => (
    <Text>{`${count} ${pluralLabel}`}</Text>
  ),
  IndexSearchBar: ({
    onFilterPress,
    placeholder,
    testIDPrefix,
    value,
  }: {
    onFilterPress?: () => void;
    placeholder?: string;
    testIDPrefix: string;
    value?: string;
  }) => (
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
  IndexFilterSheet: ({ children, visible }: { children?: React.ReactNode; visible?: boolean }) =>
    visible ? <View>{children}</View> : null,
}));

jest.mock("@/components/plan/training-path/TrainingPathChart", () => ({
  __esModule: true,
  TrainingPathChart: (props: unknown) => {
    trainingPathChartProps.push(props);
    return <View testID="builder-reactive-impact-chart" />;
  },
}));

jest.mock("@/components/plan/training-path/DailyTrainingAdjustmentChart", () => ({
  __esModule: true,
  DailyTrainingAdjustmentChart: (props: unknown) => {
    trainingPathChartProps.push(props);
    return <View testID="builder-reactive-impact-chart" />;
  },
}));

jest.mock("../BuilderGoalEditorSheetContent", () => ({
  __esModule: true,
  BuilderGoalEditorContent: ({
    goalContext,
    onCreateLocalGoal,
    onChooseNoGoal,
  }: {
    goalContext: { selectedGoals: Array<{ localId: string; title: string }> };
    onCreateLocalGoal?: () => void;
    onChooseNoGoal?: () => void;
  }) => (
    <View testID="builder-goal-editor-modal">
      <Pressable testID="builder-no-goal-choice" onPress={onChooseNoGoal}>
        <Text>No goal</Text>
      </Pressable>
      <Pressable testID="builder-create-plan-goal" onPress={onCreateLocalGoal}>
        <Text>Plan-only intent</Text>
      </Pressable>
      <Text>New profile goal</Text>
      {goalContext.selectedGoals.map((goal: { localId: string; title: string }) => (
        <Text key={goal.localId}>{goal.title}</Text>
      ))}
    </View>
  ),
  BuilderLocalGoalCreateContent: ({
    onSave,
  }: {
    onSave: (goal: {
      title: string;
      targetOffsetDays: number;
      priority: number;
      activityCategory: string;
      objective: { type: string; activity_category: string; distance_m: number };
    }) => void;
  }) => (
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

jest.mock("../BuilderSessionEditorSheetContent", () => ({
  __esModule: true,
  BuilderSessionEditorContent: ({
    onOpenActivityPicker,
    session,
  }: {
    onOpenActivityPicker: (localId: string) => void;
    session: { localId: string };
  }) => (
    <View testID="builder-session-editor-modal">
      <Pressable
        testID="builder-session-assign-activity"
        onPress={() => onOpenActivityPicker(session.localId)}
      >
        <Text>Assign</Text>
      </Pressable>
    </View>
  ),
}));

jest.mock("../BuilderScheduleEditor", () => ({
  __esModule: true,
  BuilderScheduleEditor: ({
    onAddSessionAtOffset,
  }: {
    onAddSessionAtOffset: (offset: number) => void;
  }) => (
    <View testID="builder-sessions-workspace">
      <Pressable onPress={() => onAddSessionAtOffset(0)} testID="builder-sessions-workspace-add">
        <Text>Activity</Text>
      </Pressable>
    </View>
  ),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      trainingPlans: {
        invalidate: mockInvalidateProjectionPlanView,
        preview: {
          fetch: jest.fn(async () => ({
            applicable: true,
            basePublishedRevision: projectionBaseline.publishedRevision,
            explanations: [],
            previewFingerprint: "fixture-preview",
            status: "available",
          })),
        },
      },
    }),
    profiles: {
      get: {
        useQuery: () => ({
          data: {
            id: "44444444-4444-4444-8444-444444444444",
            dob: "1998-06-01T00:00:00.000Z",
            full_name: "John Apple",
            gender: "male",
            preferred_units: "metric",
            username: "johnapple",
          },
          isError: false,
          refetch: mockContextRefetch.profile,
        }),
      },
      getPerformanceTargets: {
        useQuery: () => ({
          data: mockPerformanceModelError
            ? undefined
            : createUnavailableAthletePerformanceTargetFacts(FIXTURE_NOW.toISOString()),
          isError: Boolean(mockPerformanceModelError),
          refetch: mockContextRefetch.performanceTargets,
        }),
      },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: () => ({
          data: mockPerformanceModelError
            ? undefined
            : {
                ...projectionBaseline,
                publishedRevision: projectionBaseline.publishedRevision + mockQueryRefresh,
                currentBaseline: {
                  ...projectionBaseline.currentBaseline,
                  planningContext: creationContext.athleteContext,
                },
              },
          error: mockPerformanceModelError,
          isError: Boolean(mockPerformanceModelError),
          isLoading: false,
          refetch: mockProjectionRefetch.baseline,
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
          isError: false,
          refetch: mockContextRefetch.profileMetrics,
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
              unit: "watts",
              recorded_at: RECENT_POWER_EFFORT_RECORDED_AT,
              activity_id: null,
            },
          ],
          isError: false,
          refetch: mockContextRefetch.activityEfforts,
        }),
      },
    },
    trainingPlans: {
      commit: {},
      preview: {
        useQuery: () => ({
          data: mockAuthoritativePreviewData,
          error: mockAuthoritativePreviewError,
          isFetching: false,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
      get: {
        useQuery: (input: { id?: string } | symbol) => ({
          data:
            !mockEditPlanError && typeof input === "object" && input?.id
              ? structuredClone(editableTrainingPlan)
              : undefined,
          error: mockEditPlanError,
          isError: Boolean(mockEditPlanError),
          isLoading: false,
          refetch: jest.fn(),
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
  useReliableMutation: () => ({
    isPending: false,
    mutateAsync: (input: { kind: "create" | "update" }) => mockMutations[input.kind](input),
  }),
}));

jest.mock("@/lib/hooks/useDebouncedValue", () => ({
  __esModule: true,
  useDebouncedValue: (value: unknown) => value,
}));

describe("TrainingPlanBuilderScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXTURE_NOW);
    preventRemoveMock.mockClear();
    dispatchMock.mockClear();
    activityPlanCardProps.length = 0;
    trainingPathChartProps.length = 0;
    mockAuthoritativePreviewData = undefined;
    mockAuthoritativePreviewError = null;
    mockEditPlanError = null;
    mockPerformanceModelError = null;
    mockQueryRefresh = 0;
    for (const refetch of Object.values(mockContextRefetch)) refetch.mockReset();
    for (const refetch of Object.values(mockProjectionRefetch)) refetch.mockReset();
    mockInvalidateProjectionPlanView.mockReset();
    for (const mutation of Object.values(mockMutations)) mutation.mockReset();
    mockMutations.create.mockResolvedValue({
      status: "saved",
      planId: "55555555-5555-4555-8555-555555555555",
    });
    mockMutations.update.mockResolvedValue({
      status: "saved",
      planId: editableTrainingPlan.id,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("maps builder sheets to shared presentation presets", () => {
    expect(getBuilderSheetPresentation("activityFilters")).toEqual({
      initialSnapIndex: 0,
      snapPoints: ["78%"],
    });
    expect(getBuilderSheetPresentation("activityAssignment")).toEqual({
      initialSnapIndex: 1,
      snapPoints: ["88%", "96%"],
    });
    expect(getBuilderSheetPresentation("preferences")).toEqual({
      initialSnapIndex: 0,
      snapPoints: ["82%", "96%"],
    });
  });

  it.each([
    "create",
    "edit",
  ] as const)("renders real %s athlete assumptions through refresh and reopening", async (mode) => {
    const surface = () => (
      <TrainingPlanBuilderScreen mode={mode} planId={editableTrainingPlan.id} />
    );
    const rendered = await renderNative(surface());
    await fireEvent.press(screen.getByTestId("builder-configuration-athleteContext"));
    if (!screen.queryByLabelText("Weight")) await fireEvent.press(screen.getByText("Weight"));
    await fireEvent.changeText(screen.getByLabelText("Weight"), "73.25");
    await fireEvent.changeText(screen.getByLabelText("Weight"), "invalid");
    mockQueryRefresh += 1;
    await rendered.rerender(surface());
    expect(screen.getByLabelText("Weight").props.value).toBe("invalid");
    await fireEvent.changeText(screen.getByLabelText("Weight"), "73.25");
    await fireEvent.press(screen.getByText("Close"));
    await fireEvent.press(screen.getByTestId("builder-configuration-athleteContext"));
    expect(screen.getByLabelText("Weight").props.value).toBe("73.25");
  });

  it.each([
    "create",
    "edit",
  ] as const)("keeps real %s preference inputs through refresh, applies once, and cancels on close", async (mode) => {
    const surface = () => (
      <TrainingPlanBuilderScreen mode={mode} planId={editableTrainingPlan.id} />
    );
    const rendered = await renderNative(surface());
    await fireEvent.press(screen.getByTestId("builder-configuration-planningConstraints"));
    const initial = screen.getByLabelText("Sessions per week").props.value;
    await fireEvent.changeText(screen.getByLabelText("Sessions per week"), "4");
    await fireEvent.changeText(screen.getByLabelText("Weekly duration"), "1e");
    if (mode === "create") await fireEvent.press(screen.getByText("Add advanced preferences"));
    await fireEvent.press(screen.getByLabelText("preferred_weekdays-Mon"));
    for (let refresh = 0; refresh < 3; refresh += 1) {
      mockQueryRefresh += 1;
      await rendered.rerender(surface());
    }
    expect(screen.getByLabelText("Sessions per week").props.value).toBe("4");
    expect(screen.getByLabelText("Weekly duration").props.value).toBe("1e");
    expect(screen.getByLabelText("preferred_weekdays-Mon").props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.getByTestId("training-plan-builder-sheet-save").props.disabled).toBe(true);
    await fireEvent.press(screen.getByText("Revert changes"));
    expect(screen.getByLabelText("Sessions per week").props.value).toBe(initial);
    expect(screen.getByLabelText("Weekly duration").props.value).toBe(mode === "edit" ? "60" : "");
    expect(screen.getByLabelText("preferred_weekdays-Mon").props.accessibilityState.checked).toBe(
      false,
    );
    await fireEvent.changeText(screen.getByLabelText("Sessions per week"), "4");
    await fireEvent.changeText(screen.getByLabelText("Weekly duration"), "");
    if (mode === "edit") {
      for (const day of ["Mon", "Wed", "Thu"]) {
        await fireEvent.press(screen.getByLabelText(`rest_days-${day}`));
      }
      await fireEvent.press(screen.getByLabelText("Clear Recovery priority"));
    }
    await fireEvent.press(screen.getByLabelText("preferred_weekdays-Mon"));
    expect(screen.getByTestId("training-plan-builder-sheet-save").props.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    expect(screen.queryByTestId("training-plan-builder-sheet")).toBeNull();
    await fireEvent.press(screen.getByTestId("builder-configuration-planningConstraints"));
    expect(screen.getByLabelText("Sessions per week").props.value).toBe("4");
    expect(screen.getByLabelText("Weekly duration").props.value).toBe("");
    expect(screen.getByLabelText("preferred_weekdays-Mon").props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.queryByLabelText("Clear Recovery priority")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Sessions per week"), "invalid");
    await fireEvent.press(screen.getByText("Revert changes"));
    expect(screen.getByLabelText("Sessions per week").props.value).toBe("4");
    await fireEvent.changeText(screen.getByLabelText("Sessions per week"), "invalid");
    await fireEvent.press(screen.getByLabelText("Close Preferences"));
    await fireEvent.press(screen.getByTestId("builder-configuration-planningConstraints"));
    expect(screen.getByLabelText("Sessions per week").props.value).toBe("4");
    expect(screen.queryByText("Enter a whole number from 1 to 14.")).toBeNull();
    expect(mockMutations.create).not.toHaveBeenCalled();
    expect(mockMutations.update).not.toHaveBeenCalled();
  });

  it("opens plan metadata editing from the main composer", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByTestId("builder-strategy-composer")).toBeTruthy();
    await fireEvent.press(screen.getByText("Name your plan"));

    expect(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("What this plan is designed to do")).toBeTruthy();
  });

  it("guards back cancellation for visibility-only changes and leaves only after discard", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await renderNative(<TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />);
    await fireEvent.press(screen.getByText("Existing builder plan"));
    await fireEvent.press(screen.getByLabelText("Followers training plan"));
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    const [enabled, onRemove] = preventRemoveMock.mock.calls.at(-1) ?? [];
    expect(enabled).toBe(true);
    const action = { type: "GO_BACK" };
    await act(() => onRemove({ data: { action } }));
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith(
      "Discard changes?",
      "Your edits will be lost.",
      expect.any(Array),
    );
    const buttons = alert.mock.calls.at(-1)?.[2];
    expect(buttons?.find((button) => button.text === "Keep editing")?.style).toBe("cancel");
    await act(() => buttons?.find((button) => button.text === "Discard")?.onPress?.());
    expect(dispatchMock).toHaveBeenCalledWith(action);
    expect(mockMutations.update).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("opens builder-local goals off the main composer", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    await fireEvent.press(screen.getByText("Goals"));

    expect(screen.getByTestId("builder-goal-editor-modal")).toBeTruthy();
    expect(screen.getByTestId("builder-no-goal-choice")).toBeTruthy();
    expect(screen.getByText("Plan-only intent")).toBeTruthy();
    expect(screen.getByText("New profile goal")).toBeTruthy();
  });

  it("renders the compact production configuration rows", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByTestId("builder-configuration-grid")).toBeTruthy();
    expect(screen.getByLabelText(/Goals: No goals selected/)).toBeTruthy();
    expect(screen.getByLabelText(/Schedule:/)).toBeTruthy();
  });

  it("creates a full plan-local goal without using profile goal creation", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    await fireEvent.press(screen.getByText("Goals"));
    await fireEvent.press(screen.getByTestId("builder-create-plan-goal"));

    expect(screen.getByTestId("builder-local-goal-create-form")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByPlaceholderText("Finish a 10K, raise FTP, train consistently..."),
      "Finish a local 10K",
    );
    await fireEvent.press(screen.getByTestId("builder-local-goal-save"));

    expect(screen.getByTestId("builder-goal-editor-modal")).toBeTruthy();
    expect(screen.getAllByText("Finish a local 10K").length).toBeGreaterThan(0);
  });

  it("opens profile, metrics, and efforts from one athlete context form", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByText("Athlete")).toBeTruthy();

    await fireEvent.press(screen.getByText("Athlete"));

    expect(screen.getByText("Optional athlete details for this plan only.")).toBeTruthy();
  });

  it("opens sparse planning constraints off the main composer", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    await fireEvent.press(screen.getByText("Preferences"));

    expect(screen.getByLabelText("Sessions per week")).toBeTruthy();
  });

  it("opens date-free plan settings from the strategy composer", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    await fireEvent.press(screen.getByText("Name your plan"));

    expect(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText("YYYY-MM-DD")).toBeNull();
    expect(screen.queryByText("Start date")).toBeNull();
  });

  it("opens activity assignment from the schedule editor", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByTestId("builder-sessions-workspace")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));

    expect(screen.getByTestId("training-plan-builder-activity-picker-search")).toBeTruthy();
    expect(screen.getByTestId("training-plan-builder-activity-picker-filter")).toBeTruthy();
    expect(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    );

    expect(screen.getByTestId("builder-session-editor-modal")).toBeTruthy();
  });

  it("routes create through the canonical mutation and preserves the authored payload", async () => {
    mockAuthoritativePreviewData = {
      status: "available",
      simulation: authoritativeSimulation,
    };
    await renderNative(<TrainingPlanBuilderScreen />);

    await act(() =>
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
    await fireEvent.press(screen.getByText("Name your plan"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
      "FTP build",
    );
    await fireEvent.press(screen.getByLabelText("Followers training plan"));
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    await fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));
    await fireEvent.press(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    );
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    await waitFor(() => {
      expect(screen.getByText("Create")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockMutations.create).toHaveBeenCalledTimes(1);
    });
    expect(mockMutations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "create",
        basePublishedRevision: projectionBaseline.publishedRevision,
        draft: expect.objectContaining({
          name: "FTP build",
          contentVisibility: "followers",
          structure: expect.objectContaining({
            sessions: [
              expect.objectContaining({
                activity_plan_id: activityPlan.id,
                offset_days: 0,
              }),
            ],
          }),
        }),
      }),
    );
    expect(mockMutations.create.mock.calls[0]?.[0]).not.toHaveProperty("plannedSessions");
  });

  it("blocks authoritative commit when preview feedback is unavailable", async () => {
    mockAuthoritativePreviewError = new Error("offline");
    await renderNative(<TrainingPlanBuilderScreen />);

    await fireEvent.press(screen.getByText("Name your plan"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
      "FTP build",
    );
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    await fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));
    await fireEvent.press(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    );
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    await waitFor(() => {
      expect(screen.getByText("Create")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("Create"));

    expect(mockMutations.create).not.toHaveBeenCalled();
    expect(screen.getByText("Projection could not be loaded.")).toBeTruthy();
  });

  it("surfaces performance-model context failures and retries its query", async () => {
    mockPerformanceModelError = new Error("Performance model unavailable");
    await renderNative(<TrainingPlanBuilderScreen />);

    expect(screen.getByText("Athlete context unavailable")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Retry athlete context unavailable"));

    expect(mockProjectionRefetch.baseline).toHaveBeenCalledTimes(1);
  });

  it("hydrates edit mode into the new builder save flow", async () => {
    mockAuthoritativePreviewData = { status: "available", simulation: authoritativeSimulation };
    await renderNative(
      <TrainingPlanBuilderScreen mode="edit" planId="22222222-2222-4222-8222-222222222222" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeTruthy();
      expect(screen.getByText("Existing builder plan")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("Existing builder plan"));
    expect(screen.getByLabelText("Private training plan").props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByLabelText("Followers training plan"));
    expect(screen.getByLabelText("Followers training plan").props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByLabelText("Public training plan"));
    expect(screen.getByLabelText("Public training plan").props.accessibilityState).toEqual({
      checked: true,
    });
    expect(mockMutations.update).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockMutations.update).toHaveBeenCalledTimes(1));
    expect(mockMutations.update.mock.calls[0]?.[0]).toMatchObject({
      kind: "update",
      draft: {
        planId: editableTrainingPlan.id,
        contentVisibility: "public",
      },
    });
  });

  it("shows an explicit retry state when edit hydration fails", async () => {
    mockEditPlanError = new Error("Plan unavailable");

    await renderNative(
      <TrainingPlanBuilderScreen mode="edit" planId="22222222-2222-4222-8222-222222222222" />,
    );

    expect(screen.getByText("Could not load this training plan")).toBeTruthy();
    expect(screen.getByLabelText("Retry loading training plan")).toBeTruthy();
  });
});
