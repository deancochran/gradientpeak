import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityPlanSummary } from "../ActivityPlanSummary";
import { createPrescriptionQuantificationBundleFixture } from "./activityQuantificationFixture";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = {
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: id(4),
      role: "rest",
      name: "Prepare",
      duration: { type: "time", seconds: 60 },
    },
    {
      id: id(1),
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: id(2),
          name: "Work",
          repetitions: 2,
          steps: [
            {
              id: id(3),
              name: "Tempo",
              duration: { type: "time", seconds: 450 },
              targets: [{ type: "RPE", intensity: 6 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("ActivityPlanSummary", () => {
  it("shows unavailable summary quantities without inventing authored values", () => {
    renderNative(
      <ActivityPlanSummary showAttribution={false} structure={structure} title="Tempo repeats" />,
    );

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.queryByText("Steps")).toBeNull();
    expect(screen.queryByText(/RPE 6|Prescribed intensity/)).toBeNull();
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
    expect(screen.queryByText(/^0(?:\.00|m)?$/)).toBeNull();
  });

  it("shows canonical prescribed Common Load and normalized intensity", () => {
    renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture()}
        showAttribution={false}
        title="Tempo run"
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(screen.queryByText(/RPE|Prescribed/)).toBeNull();
  });

  it("keeps cards summary-only beside a complete planned estimate", () => {
    renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture({
          estimated: false,
        })}
        showAttribution={false}
        title="Calibrated run"
      />,
    );

    expect(screen.queryByText(/RPE|Prescribed/)).toBeNull();
  });

  it("labels partial planned evidence without substituting zero", () => {
    renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture({
          status: "partial",
        })}
        showAttribution={false}
        title="Tempo run"
      />,
    );

    expect(screen.getByText(/32 known \(partial\)/)).toBeTruthy();
    expect(screen.getByText(/0\.80 known \(partial\)/)).toBeTruthy();
    expect(screen.queryByText(/^0(?:\.00|m)?$/)).toBeNull();
  });

  it("shows known partial projection values as partial", () => {
    renderNative(
      <ActivityPlanSummary
        projectionMetrics={[
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "partial",
            value: 900,
            unit: "seconds",
            reason: "estimate_incomplete",
          },
          {
            key: "common_load",
            label: "Common Load",
            status: "partial",
            value: 88,
            unit: "score",
            reason: "estimate_incomplete",
          },
          {
            key: "normalized_intensity",
            label: "Normalized intensity",
            status: "partial",
            value: 0.9,
            unit: "ratio",
            reason: "estimate_incomplete",
          },
        ]}
        showAttribution={false}
        title="Incomplete plan"
      />,
    );

    expect(screen.getByText(/15m known \(partial\)/)).toBeTruthy();
    expect(screen.getByText(/88 known \(partial\)/)).toBeTruthy();
    expect(screen.getByText(/0\.90 known \(partial\)/)).toBeTruthy();
  });

  it("omits private calculated quantities and emits no invented zero", () => {
    const rendered = renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture({
          status: "private",
        })}
        showAttribution={false}
        title="Private plan"
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("1h")).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(3);
    expect(screen.queryByText(/^0(?:\.00|m)?$/)).toBeNull();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(
      /TSS|\bIF\b|intensityFactor|category_load/,
    );
  });
});
