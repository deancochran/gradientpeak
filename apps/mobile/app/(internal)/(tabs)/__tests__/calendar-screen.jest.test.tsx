import { create } from "zustand";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const calendarPageUseQueryMock = jest.fn();
const dateTimePickerAndroidOpenMock = jest.fn();
const refetchMock = jest.fn(async () => undefined);
const today = "2026-03-23";

type CalendarStoreState = {
  activeDate: string | null;
  hydrated: boolean;
  setActiveDate: (date: string | null) => void;
};

const createCalendarStore = () =>
  create<CalendarStoreState>((set) => ({
    activeDate: today,
    hydrated: true,
    setActiveDate: (activeDate) => set({ activeDate }),
  }));
let useCalendarStore = createCalendarStore();

const addDays = (key: string, days: number) => {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Modal: createHost("Modal"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  PlanCalendarSkeleton: createHost("PlanCalendarSkeleton"),
}));
jest.mock("@/components/shared", () => ({ __esModule: true, AppHeader: createHost("AppHeader") }));
jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/lib/performance", () => ({ __esModule: true, usePerformanceScreenReady: jest.fn() }));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  DateTimePickerAndroid: { open: dateTimePickerAndroidOpenMock },
  default: createHost("DateTimePicker"),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));
jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
}));
jest.mock("@/lib/hooks/useLocalTodayKey", () => ({
  __esModule: true,
  useLocalTodayKey: () => today,
}));
jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(
    selector: (state: { ready: boolean; session: { user: { id: string } } }) => T,
  ) => selector({ ready: true, session: { user: { id: "user-1" } } }),
}));
jest.mock("@/lib/stores/calendar-store", () => ({
  __esModule: true,
  useCalendarStore: <T,>(selector: (state: CalendarStoreState) => T) =>
    selector(useCalendarStore()),
}));
jest.mock("@/lib/calendar/dateMath", () => ({
  __esModule: true,
  addDaysToDateKey: addDays,
  addMonthsToDateKey: (key: string, months: number) => {
    const [yearPart, monthPart, dayPart] = key.split("-");
    if (!yearPart || !monthPart || !dayPart) {
      throw new Error(`Invalid date key: ${key}`);
    }
    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);
    const target = new Date(Date.UTC(year, month - 1 + months + 1, 0));
    target.setUTCDate(Math.min(day, target.getUTCDate()));
    return target.toISOString().slice(0, 10);
  },
  getMonthGridStartKey: (key: string) =>
    addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7)),
  getStartOfMonthKey: (key: string) => `${key.slice(0, 8)}01`,
  isSameMonth: (key: string, month: string) => key.slice(0, 7) === month.slice(0, 7),
  parseDateKey: (key: string) => new Date(`${key}T12:00:00Z`),
  toDateKey: (date: Date) => date.toISOString().slice(0, 10),
}));
jest.mock("@repo/core", () => ({ __esModule: true, compareCalendarProjectionItems: () => 0 }));
jest.mock("@/lib/calendar/eventRouting", () => ({
  __esModule: true,
  buildOpenEventRoute: (item: { id: string }) => `/event/${item.id}`,
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    calendar: {
      page: {
        useQuery: (input: unknown, options: unknown) => calendarPageUseQueryMock(input, options),
      },
    },
  },
}));

const CalendarScreen = require("@/components/calendar/CalendarTabView").CalendarTabView;

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      items: [
        {
          id: "event-1",
          kind: "event",
          calendarDate: today,
          title: "Track session",
          timing: { allDay: false, startsAt: null, timezone: "UTC" },
          metrics: [],
          estimated: false,
          subtitle: null,
          event: { type: "custom" },
        },
      ],
      truncated: false,
    },
    isError: false,
    isFetching: false,
    isLoading: false,
    isRefetchError: false,
    refetch: refetchMock,
    ...overrides,
  };
}

describe("calendar fixed month page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCalendarStore = createCalendarStore();
    calendarPageUseQueryMock.mockReturnValue(queryResult());
  });

  it("loads one Monday-first six-week page and exposes all calendar controls", async () => {
    await renderNative(<CalendarScreen />);
    expect(calendarPageUseQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ pageStartDate: "2026-02-23", pageSizeDays: 42 }),
      expect.objectContaining({ placeholderData: expect.any(Function) }),
    );
    expect(screen.getByTestId("calendar-month-page-2026-03-01")).toBeTruthy();
    expect(screen.getAllByTestId(/calendar-day-select-/)).toHaveLength(42);
    expect(screen.getByTestId("calendar-day-select-2026-02-23")).toBeTruthy();
    expect(screen.getByTestId("calendar-day-select-2026-04-05")).toBeTruthy();
    expect(screen.getByTestId("calendar-previous-month")).toBeTruthy();
    expect(screen.getByTestId("calendar-next-month")).toBeTruthy();
    expect(screen.getByTestId("calendar-reset-today-entry")).toBeTruthy();
    expect(screen.getByTestId("calendar-date-jump-entry")).toBeTruthy();
    expect(screen.getByTestId("create-event-entry")).toBeTruthy();
    expect(
      screen.getAllByTestId(/calendar-day-number-/, { includeHiddenElements: true }),
    ).toHaveLength(42);
    expect(screen.queryByText(/Fill is completed load/)).toBeNull();
  });

  it("opens the canonical day training breakdown from a calendar selection", async () => {
    await renderNative(<CalendarScreen />);
    await fireEvent.press(screen.getByTestId("calendar-day-select-2026-03-24"));
    expect(useCalendarStore.getState().activeDate).toBe("2026-03-24");
    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/planning-ledger",
      params: { anchorDate: "2026-03-24", period: "day" },
    });
  });

  it("moves month pages while retaining the selected day-of-month and keeps ready content while loading", async () => {
    calendarPageUseQueryMock.mockReturnValue(queryResult({ isFetching: true }));
    await renderNative(<CalendarScreen />);
    await fireEvent.press(screen.getByTestId("calendar-next-month"));
    expect(useCalendarStore.getState().activeDate).toBe("2026-04-23");
    expect(screen.getByTestId("calendar-month-loading")).toBeTruthy();
    expect(screen.getByTestId("calendar-screen-ready")).toBeTruthy();
    expect(screen.getByTestId("calendar-month-page-2026-04-01")).toBeTruthy();
  });

  it("clamps month navigation from January 31 to February 28", async () => {
    useCalendarStore.setState({ activeDate: "2026-01-31" });
    await renderNative(<CalendarScreen />);

    await fireEvent.press(screen.getByTestId("calendar-next-month"));

    expect(useCalendarStore.getState().activeDate).toBe("2026-02-28");
  });

  it("selects the date chosen in the date picker", async () => {
    await renderNative(<CalendarScreen />);

    await fireEvent.press(screen.getByTestId("calendar-date-jump-entry"));
    await fireEvent(
      screen.getByTestId("calendar-date-picker"),
      "change",
      { type: "set" },
      new Date(2026, 8, 8, 12),
    );
    await fireEvent.press(screen.getByTestId("calendar-date-jump-confirm"));

    expect(useCalendarStore.getState().activeDate).toBe("2026-09-08");
    expect(screen.getByLabelText(/^Open training breakdown for 2026-09-08\./)).toBeTruthy();
  });

  it("retries a failed calendar page", async () => {
    calendarPageUseQueryMock.mockReturnValue(queryResult({ data: undefined, isError: true }));
    await renderNative(<CalendarScreen />);
    await fireEvent.press(screen.getByTestId("calendar-retry"));
    expect(refetchMock).toHaveBeenCalled();
  });
});
