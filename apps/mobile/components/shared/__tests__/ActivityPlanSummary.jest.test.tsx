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
  it("keeps prescribed structure intensity when canonical normalized values are unavailable", () => {
    renderNative(
      <ActivityPlanSummary
        estimatedDuration={900}
        showAttribution={false}
        structure={structure}
        title="Tempo repeats"
      />,
    );

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("Prescribed intensity: RPE 6 · Prescribed")).toBeTruthy();
  });

  it("shows canonical prescribed Common Load, normalized intensity, method, and evidence", () => {
    renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture()}
        showAttribution={false}
        title="Tempo run"
      />,
    );

    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(
      screen.getByText("Derived. Common Load is available using Run pace threshold."),
    ).toBeTruthy();
    expect(screen.getByText("Prescribed intensity: RPE 7/10 · Prescribed")).toBeTruthy();
  });

  it("distinguishes calibrated prescribed evidence from an estimated prescription", () => {
    renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture({
          estimated: false,
        })}
        showAttribution={false}
        title="Calibrated run"
      />,
    );

    expect(
      screen.getByText("Derived. Common Load is available using Run pace threshold."),
    ).toBeTruthy();
    expect(screen.getByText("Prescribed intensity: RPE 7/10 · Prescribed")).toBeTruthy();
  });

  it("marks partial canonical evidence without substituting zero", () => {
    renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture({
          status: "partial",
        })}
        showAttribution={false}
        title="Partial tempo run"
      />,
    );

    expect(screen.getByText("32")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(
      screen.getByText(
        "Derived · Partial. Common Load is partial using Run pace threshold; missing evidence is not treated as zero.",
      ),
    ).toBeTruthy();
  });

  it("keeps private quantification unavailable and emits no retired metric labels", () => {
    const rendered = renderNative(
      <ActivityPlanSummary
        prescriptionQuantification={createPrescriptionQuantificationBundleFixture({
          status: "private",
        })}
        showAttribution={false}
        title="Private plan"
      />,
    );

    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(
        "Required activity data is private. Allow access to the required activity data.",
      ),
    ).toBeTruthy();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(
      /TSS|\bIF\b|intensityFactor|category_load/,
    );
  });
});
