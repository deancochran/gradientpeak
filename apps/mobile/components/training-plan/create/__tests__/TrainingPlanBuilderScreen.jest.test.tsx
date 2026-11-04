import {
  athleteStateBaselineSchema,
  createAthletePlanningContextFromSnapshot,
  createUnavailableAthletePerformanceTargetFacts,
  simulateTrainingPlan,
} from "@repo/core";
import React from "react";

const mockAccountId = "11111111-1111-4111-8111-111111111111";
jest.mock("@/lib/stores/auth-store", () => {
  const state = () => ({ session: { user: { id: mockAccountId } }, profile: null });
  return {
    useAuthStore: Object.assign(
      (selector: (value: ReturnType<typeof state>) => unknown) => selector(state()),
      { getState: state },
    ),
  };
});

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
let mockPathname = "/training-plan-create";
let mockFocused = true;
let mockNestedGoal = false;
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
  useIsFocused: () => mockFocused,
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
const mockCommitPreview = jest.fn();

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
    Trophy: Icon,
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
  useNavigation: () => ({
    dispatch: dispatchMock,
    addListener: jest.fn(() => jest.fn()),
    getState: () => ({ index: 0, routes: [] }),
  }),
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => ({ returnToTrainingPlanCreate: mockNestedGoal ? "1" : undefined }),
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
  Input: ({ testId, ...props }: React.ComponentProps<typeof TextInput> & { testId?: string }) => (
    <TextInput {...props} testID={props.testID ?? testId} />
  ),
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
  BuilderLocalGoalCreateContent: jest.requireActual("../BuilderGoalEditorSheetContent")
    .BuilderLocalGoalCreateContent,
}));

jest.mock("../BuilderScheduleEditor", () => ({
  __esModule: true,
  BuilderScheduleEditor: ({
    onAddSessionAtOffset,
    onPressSession,
    viewModel,
  }: React.ComponentProps<typeof import("../BuilderScheduleEditor").BuilderScheduleEditor>) => (
    <View testID="builder-sessions-workspace">
      <Pressable onPress={() => onAddSessionAtOffset(0)} testID="builder-sessions-workspace-add">
        <Text>Activity</Text>
      </Pressable>
      {viewModel.timelineWeeks.flatMap((week) =>
        week.sessions.map(({ session }) => (
          <Pressable
            key={session.localId}
            testID={`builder-timeline-activity-${session.localId}`}
            onPress={() => onPressSession(session.localId)}
          >
            <Text>{session.activityPlan?.name ?? "Session"}</Text>
          </Pressable>
        )),
      )}
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
          fetch: mockCommitPreview,
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
      commit: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: (input: { kind: "create" | "update" }) => mockMutations[input.kind](input),
        }),
      },
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

jest.mock("@/lib/hooks/useDebouncedValue", () => ({
  __esModule: true,
  useDebouncedValue: (value: unknown) => value,
}));

async function selectQuantity(label: string, value: number) {
  await fireEvent.press(screen.getByLabelText(label));
  await fireEvent(
    screen.queryByLabelText(`${label} Value`) ?? screen.getByLabelText(`${label} units`),
    "valueChange",
    value,
  );
  await fireEvent.press(screen.getByLabelText(`Done ${label}`));
}

async function selectBudget(label: string, hours: number, minutes: number) {
  await fireEvent.press(screen.getByLabelText(label));
  await fireEvent(screen.getByLabelText(`${label} hours`), "valueChange", hours);
  await fireEvent(screen.getByLabelText(`${label} minutes`), "valueChange", minutes);
  await fireEvent.press(screen.getByLabelText(`Done ${label}`));
}

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
    mockPathname = "/training-plan-create";
    mockFocused = true;
    mockNestedGoal = false;
    editableTrainingPlan.editor.revision = 1;
    editableTrainingPlan.editor.structureHash = `v1:sha256:${"a".repeat(64)}`;
    mockCommitPreview.mockReset().mockResolvedValue({
      applicable: true,
      basePublishedRevision: projectionBaseline.publishedRevision,
      explanations: [],
      previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      status: "available",
    });
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

  it("single-flights a delayed preview but permits exit and fences its late result", async () => {
    mockAuthoritativePreviewData = { status: "available", simulation: authoritativeSimulation };
    let resolvePreview!: (value: object) => void;
    mockCommitPreview.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const alert = jest.spyOn(Alert, "alert");
    const view = await renderNative(
      <TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />,
    );
    let save!: Promise<void>;
    await act(() => {
      const press = screen.getByTestId("training-plan-save-button").props.onPress;
      save = press();
      void press();
    });
    expect(mockCommitPreview).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("training-plan-save-button").props.disabled).toBe(true);
    expect(preventRemoveMock).not.toHaveBeenCalled();
    mockPathname = "/profile";
    mockFocused = false;
    await view.rerender(<TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />);
    expect(screen.queryByTestId("builder-strategy-composer")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    await act(async () => {
      resolvePreview({
        status: "available",
        applicable: true,
        basePublishedRevision: 4,
        previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
        explanations: [],
      });
      await save;
    });
    expect(mockMutations.update).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("keeps the hydrated edit revision when refreshed server data advances", async () => {
    mockAuthoritativePreviewData = { status: "available", simulation: authoritativeSimulation };
    mockMutations.update.mockResolvedValue({ status: "stale", reason: "plan_revision" });
    const view = await renderNative(
      <TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />,
    );
    editableTrainingPlan.editor.revision = 2;
    editableTrainingPlan.editor.structureHash = "remote-hash";
    mockQueryRefresh += 1;
    await view.rerender(<TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />);
    await fireEvent.press(screen.getByTestId("training-plan-save-button"));
    await waitFor(() => expect(mockMutations.update).toHaveBeenCalledTimes(1));
    expect(mockMutations.update.mock.calls[0]?.[0].draft).toMatchObject({
      expectedRevision: 1,
      expectedStructureHash: `v1:sha256:${"a".repeat(64)}`,
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
    await fireEvent.press(screen.getByLabelText("Close Athlete"));
    await fireEvent.press(screen.getByTestId("builder-configuration-athleteContext"));
    expect(screen.getByLabelText("Weight").props.value).toBe("73.25");
    await fireEvent.changeText(screen.getByLabelText("Weight"), "73.25");
    await fireEvent.press(screen.getByLabelText("Close Athlete"));
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
    const initial = screen.getByLabelText("Sessions per week").props.accessibilityValue;
    await selectQuantity("Sessions per week", 4);
    await selectBudget("Weekly duration", 0, 0);
    if (mode === "create") await fireEvent.press(screen.getByText("Add advanced preferences"));
    await fireEvent.press(screen.getByLabelText("preferred_weekdays-Mon"));
    for (let refresh = 0; refresh < 3; refresh += 1) {
      mockQueryRefresh += 1;
      await rendered.rerender(surface());
    }
    expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
      text: "4",
    });
    await fireEvent.press(screen.getByLabelText("Weekly duration"));
    expect(screen.getByLabelText("Weekly duration minutes").props.selectedValue).toBe(0);
    await fireEvent.press(screen.getByLabelText("Done Weekly duration"));
    expect(screen.getByLabelText("preferred_weekdays-Mon").props.accessibilityState.checked).toBe(
      true,
    );
    // A zero-positioned optional duration is not an authored invalid value.
    expect(screen.getByTestId("training-plan-builder-sheet-save").props.disabled).toBe(
      mode === "edit",
    );
    await fireEvent.press(screen.getByText("Revert changes"));
    expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual(initial);
    await fireEvent.press(screen.getByLabelText("Weekly duration"));
    expect(screen.getByLabelText("Weekly duration hours").props.selectedValue).toBe(
      mode === "edit" ? 1 : 0,
    );
    await fireEvent.press(screen.getByLabelText("Done Weekly duration"));
    expect(screen.getByLabelText("preferred_weekdays-Mon").props.accessibilityState.checked).toBe(
      false,
    );
    await selectQuantity("Sessions per week", 4);
    if (mode === "edit") {
      await fireEvent.press(screen.getByLabelText("Weekly duration"));
      await fireEvent.press(screen.getByLabelText("Clear Weekly duration"));
      await fireEvent.press(screen.getByLabelText("Done Weekly duration"));
    }
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
    expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
      text: "4",
    });
    expect(screen.getByLabelText("Weekly duration").props.accessibilityValue).toEqual({
      text: "Not set",
    });
    expect(screen.getByLabelText("preferred_weekdays-Mon").props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.queryByLabelText("Clear Recovery priority")).toBeNull();
    await selectQuantity("Sessions per week", 0);
    await fireEvent.press(screen.getByText("Revert changes"));
    expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
      text: "4",
    });
    await selectQuantity("Sessions per week", 0);
    await fireEvent.press(screen.getByLabelText("Close Preferences"));
    expect(screen.queryByTestId("training-plan-builder-sheet")).toBeNull();
    await fireEvent.press(screen.getByTestId("builder-configuration-planningConstraints"));
    expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
      text: "4",
    });
    expect(screen.queryByText("Enter a whole number from 1 to 14.")).toBeNull();
    expect(mockMutations.create).not.toHaveBeenCalled();
    expect(mockMutations.update).not.toHaveBeenCalled();
  });

  it("discards unapplied metadata on Close without a confirmation or resume choice", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await renderNative(<TrainingPlanBuilderScreen />);
    await fireEvent.press(screen.getByText("Name your plan"));
    await fireEvent.changeText(screen.getByTestId("builder-plan-name-input"), "Unsaved metadata");
    await fireEvent.press(screen.getByLabelText("Close Plan Settings"));
    expect(screen.queryByTestId("training-plan-builder-sheet")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Name your plan"));
    expect(screen.getByTestId("builder-plan-name-input").props.value).toBe("");
    alert.mockRestore();
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

  it("keeps the open flow during an owned child picker and background-only rerender, but discards it on exit", async () => {
    const view = await renderNative(<TrainingPlanBuilderScreen />);
    await fireEvent.press(screen.getByText("Name your plan"));
    await fireEvent.changeText(screen.getByTestId("builder-plan-name-input"), "In progress");
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    mockQueryRefresh += 1;
    await view.rerender(<TrainingPlanBuilderScreen />);
    expect(screen.getByText("In progress")).toBeTruthy();
    mockPathname = "/goal-create";
    mockFocused = false;
    mockNestedGoal = true;
    await view.rerender(<TrainingPlanBuilderScreen />);
    mockPathname = "/training-plan-create";
    mockFocused = true;
    mockNestedGoal = false;
    await view.rerender(<TrainingPlanBuilderScreen />);
    expect(screen.getByText("In progress")).toBeTruthy();
    mockPathname = "/profile";
    mockFocused = false;
    await view.rerender(<TrainingPlanBuilderScreen />);
    expect(screen.queryByTestId("builder-strategy-composer")).toBeNull();
    mockPathname = "/training-plan-create";
    mockFocused = true;
    await view.rerender(<TrainingPlanBuilderScreen />);
    expect(screen.getByText("Name your plan")).toBeTruthy();
    expect(screen.queryByText("In progress")).toBeNull();
    expect(mockMutations.create).not.toHaveBeenCalled();
  });

  it("drops unsaved edit values on leaving and reloads only the persisted plan on return", async () => {
    const alert = jest.spyOn(Alert, "alert");
    const view = await renderNative(
      <TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />,
    );
    await fireEvent.press(screen.getByText("Existing builder plan"));
    await fireEvent.press(screen.getByLabelText("Followers training plan"));
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    expect(preventRemoveMock).not.toHaveBeenCalled();
    mockPathname = "/profile";
    mockFocused = false;
    await view.rerender(<TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />);
    mockPathname = "/training-plan-edit";
    mockFocused = true;
    await view.rerender(<TrainingPlanBuilderScreen mode="edit" planId={editableTrainingPlan.id} />);
    await fireEvent.press(screen.getByText("Existing builder plan"));
    expect(screen.getByLabelText("Private training plan").props.accessibilityState.checked).toBe(
      true,
    );
    expect(editableTrainingPlan.content_visibility).toBe("private");
    expect(alert).not.toHaveBeenCalled();
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
    await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Finish a local 10K");
    const label = screen.getByTestId("goal-duration").props.accessibilityLabel;
    await fireEvent.press(screen.getByTestId("goal-duration"));
    await fireEvent(screen.getByTestId("goal-duration-minutes"), "valueChange", 30);
    await fireEvent.press(screen.getByLabelText(`Done ${label}`));
    await fireEvent.press(screen.getByText("Add to plan"));

    expect(screen.getByTestId("builder-goal-editor-modal")).toBeTruthy();
    expect(screen.getAllByText("Finish a local 10K").length).toBeGreaterThan(0);
  });

  it("discards an unfinished plan-local goal on Close, including invalid duration", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await renderNative(<TrainingPlanBuilderScreen />);
    await fireEvent.press(screen.getByText("Goals"));
    await fireEvent.press(screen.getByTestId("builder-create-plan-goal"));
    await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Retain goal");
    const label = screen.getByTestId("goal-duration").props.accessibilityLabel;
    await fireEvent.press(screen.getByTestId("goal-duration"));
    await fireEvent(screen.getByTestId("goal-duration-seconds"), "valueChange", 0);
    await fireEvent.press(screen.getByLabelText(`Done ${label}`));
    await fireEvent.press(screen.getByLabelText("Close Create Plan Goal"));
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Goals"));
    await fireEvent.press(screen.getByTestId("builder-create-plan-goal"));
    expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("");
    expect(screen.getByTestId("goal-duration").props.accessibilityValue).toEqual({
      text: "Not set",
    });
    alert.mockRestore();
  });

  it("discards invalid session text on close and reopens accepted values without stale errors", async () => {
    await renderNative(<TrainingPlanBuilderScreen />);
    await fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));
    await fireEvent.press(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    );
    const initialSaveDisabled = screen.getByTestId("training-plan-save-button").props.disabled;
    await selectBudget("Planned duration", 0, 45);
    await selectQuantity("Target common load", 20);
    await selectBudget("Planned duration", 0, 0);
    await fireEvent.press(screen.getByLabelText("Target common load"));
    await fireEvent(screen.getByLabelText("Target common load thousands"), "valueChange", 10);
    await fireEvent(screen.getByLabelText("Target common load units"), "valueChange", 1);
    await fireEvent.press(screen.getByLabelText("Done Target common load"));
    await fireEvent.press(screen.getByLabelText("Planned duration"));
    expect(screen.getByLabelText("Planned duration minutes").props.selectedValue).toBe(0);
    await fireEvent.press(screen.getByLabelText("Done Planned duration"));
    expect(screen.getByLabelText("Target common load").props.accessibilityValue).toEqual({
      text: "10001",
    });
    expect(screen.getByTestId("training-plan-save-button").props.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText("Close Activity"));
    await fireEvent.press(screen.getByTestId(/builder-timeline-activity-/));
    await fireEvent.press(screen.getByLabelText("Planned duration"));
    expect(screen.getByLabelText("Planned duration minutes").props.selectedValue).toBe(45);
    await fireEvent.press(screen.getByLabelText("Done Planned duration"));
    expect(screen.getByLabelText("Target common load").props.accessibilityValue).toEqual({
      text: "20",
    });
    expect(screen.getByTestId("training-plan-save-button").props.disabled).toBe(
      initialSaveDisabled,
    );
    await fireEvent.press(screen.getByLabelText("Planned duration"));
    await fireEvent.press(screen.getByLabelText("Clear Planned duration"));
    await fireEvent.press(screen.getByLabelText("Done Planned duration"));
    await fireEvent.press(screen.getByLabelText("Target common load"));
    await fireEvent.press(screen.getByLabelText("Clear Target common load"));
    await fireEvent.press(screen.getByLabelText("Done Target common load"));
    await fireEvent.press(screen.getByLabelText("Close Activity"));
    await fireEvent.press(screen.getByTestId(/builder-timeline-activity-/));
    expect(screen.getByLabelText("Planned duration").props.accessibilityValue).toEqual({
      text: "Not set",
    });
    expect(screen.getByLabelText("Target common load").props.accessibilityValue).toEqual({
      text: "Not set",
    });
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

    await fireEvent.press(screen.getByTestId("training-plan-builder-activity-picker-filter"));
    expect(screen.getByTestId("training-plan-builder-activity-filter-sheet")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("training-plan-builder-activity-sort-name"));
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    expect(screen.getByTestId("training-plan-builder-activity-picker-search")).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    );

    expect(screen.getByTestId("builder-session-editor-modal")).toBeTruthy();
  });

  it("cancels an unassigned activity picker draft before closing the full-screen picker", async () => {
    mockAuthoritativePreviewData = { status: "available", simulation: authoritativeSimulation };
    await renderNative(<TrainingPlanBuilderScreen />);

    await fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));
    await fireEvent.press(screen.getByLabelText("Close activity picker"));
    expect(screen.queryByTestId("builder-activity-picker-screen")).toBeNull();

    await fireEvent.press(screen.getByText("Name your plan"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Base builder, race prep, return to training..."),
      "No phantom session",
    );
    await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
    await fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));
    await fireEvent.press(
      screen.getByTestId(`training-plan-builder-activity-row-${activityPlan.id}`),
    );
    await fireEvent.press(screen.getByLabelText("Close Activity"));
    await fireEvent.press(screen.getByText("Create"));

    await waitFor(() => expect(mockMutations.create).toHaveBeenCalledTimes(1));
    expect(mockMutations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          structure: expect.objectContaining({
            sessions: [expect.objectContaining({ activity_plan_id: activityPlan.id })],
          }),
        }),
      }),
    );
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
    await fireEvent.press(screen.getByLabelText("Close Activity"));
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
    await fireEvent.press(screen.getByLabelText("Close Activity"));
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
