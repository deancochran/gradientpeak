import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import {
  formatPlannedDayActivityCategories,
  formatPlannedDayDuration,
  formatPlannedDayTss,
  type MobilePlannedDaySummaryData,
  PlannedDaySummary,
} from "../PlannedDaySummary";
import { announcePlannedDaySummaryRetryStatus } from "../plannedDaySummaryAccessibility";

jest.mock("../plannedDaySummaryAccessibility", () => ({
  __esModule: true,
  announcePlannedDaySummaryRetryStatus: jest.fn(),
}));

const data: MobilePlannedDaySummaryData = {
  source: {
    complete: true,
    eventCount: 2,
    unavailableEstimateCount: 0,
    unavailablePlanCount: 0,
    unlinkedPlanCount: 0,
  },
  summary: {
    eventCount: 2,
    activity_categories: ["bike", "run"],
    totalDurationSeconds: 5_400,
    totalTss: 87.25,
  },
};

describe("PlannedDaySummary", () => {
  it("presents known planned totals and a stable, unique activity_category mix", () => {
    renderNative(
      <PlannedDaySummary data={data} error={false} isLoading={false} onRetry={jest.fn()} />,
    );

    expect(screen.getByText("2 Events")).toBeTruthy();
    expect(screen.getByText("Bike + Run")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("87.3 TSS")).toBeTruthy();
    expect(screen.getByLabelText("Bike plus Run")).toBeTruthy();
    expect(
      screen.getByText(/Scheduled\/completed planned workload; cancelled excluded/),
    ).toBeTruthy();
  });

  it("does not duplicate repeated activity_categories or imply a combined activity", () => {
    expect(formatPlannedDayActivityCategories(["bike", "bike", "run", "bike"])).toBe("Bike + Run");
    expect(formatPlannedDayActivityCategories(["run", "run"])).toBe("Run");
  });

  it("uses composition language without arrows, combined-activity, or multisport labels", () => {
    renderNative(
      <PlannedDaySummary data={data} error={false} isLoading={false} onRetry={jest.fn()} />,
    );

    expect(
      screen.queryByText(/arrow|brick|triathlon|transition|combined activity|synthetic/i),
    ).toBeNull();
  });

  it("formats finite fractional TSS and marks null or nonfinite values unavailable", () => {
    expect(formatPlannedDayTss(42.04)).toBe("42 TSS");
    expect(formatPlannedDayTss(42.06)).toBe("42.1 TSS");
    expect(formatPlannedDayTss(null)).toBe("Unavailable");
    expect(formatPlannedDayTss(Number.NaN)).toBe("Unavailable");
    expect(formatPlannedDayTss(Number.POSITIVE_INFINITY)).toBe("Unavailable");
    expect(formatPlannedDayTss(Number.NEGATIVE_INFINITY)).toBe("Unavailable");
    expect(formatPlannedDayDuration(5_400)).toBe("1h 30m");
    expect(formatPlannedDayDuration(90)).toBe("1m 30s");
    expect(formatPlannedDayDuration(Number.NaN)).toBe("Unavailable");
    expect(formatPlannedDayDuration(Number.POSITIVE_INFINITY)).toBe("Unavailable");
  });

  it("makes retry semantic, busy, and announced until its deferred request settles", async () => {
    let resolveRetry: (() => void) | undefined;
    const retry = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );
    const announce = jest.mocked(announcePlannedDaySummaryRetryStatus);
    renderNative(<PlannedDaySummary error isLoading={false} onRetry={retry} />);

    const button = screen.getByTestId("calendar-day-planned-summary-retry");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityHint).toMatch(/Attempts to load/);
    fireEvent.press(button);
    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(button.props.disabled).toBe(true);
    expect(screen.getByText("Retrying planned workload.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Retrying planned workload.");

    await act(async () => {
      resolveRetry?.();
    });
    expect(screen.getByTestId("calendar-day-planned-summary-retry").props.disabled).toBe(false);
    expect(screen.getByText("Planned workload retry finished.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Planned workload retry finished.");
  });

  it("announces a handled retry failure and re-enables the retry button", async () => {
    const retry = jest.fn(() => Promise.reject(new Error("offline")));
    const announce = jest.mocked(announcePlannedDaySummaryRetryStatus);
    renderNative(<PlannedDaySummary error isLoading={false} onRetry={retry} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("calendar-day-planned-summary-retry"));
    });
    expect(screen.getByTestId("calendar-day-planned-summary-retry").props.disabled).toBe(false);
    expect(
      screen.getByText("Planned workload retry failed. The error remains available."),
    ).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(
      "Planned workload retry failed. The error remains available.",
    );
  });

  it("distinguishes empty, loading, error with retry, and partial information", async () => {
    const retry = jest.fn(() => Promise.resolve());
    const { rerender } = renderNative(
      <PlannedDaySummary error={false} isLoading onRetry={retry} />,
    );
    expect(screen.getByText("Loading planned workload...")).toBeTruthy();

    rerender(<PlannedDaySummary error isLoading={false} onRetry={retry} />);
    expect(screen.getByText("Planned workload could not be loaded.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("calendar-day-planned-summary-retry"));
    });
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(
      <PlannedDaySummary
        data={{
          ...data,
          source: {
            ...data.source,
            unavailableEstimateCount: 1,
            unavailablePlanCount: 1,
            unlinkedPlanCount: 1,
          },
          summary: {
            ...data.summary,
            totalDurationSeconds: null,
            totalTss: null,
          },
        }}
        error={false}
        isLoading={false}
        onRetry={retry}
      />,
    );
    expect(screen.getByText(/Partial information:/)).toBeTruthy();
    expect(screen.getByText(/unavailable planned estimates/)).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);

    rerender(
      <PlannedDaySummary
        data={{ ...data, summary: { ...data.summary, eventCount: 0 } }}
        error={false}
        isLoading={false}
        onRetry={retry}
      />,
    );
    expect(screen.getByText("No planned Events for this day.")).toBeTruthy();
  });
});
