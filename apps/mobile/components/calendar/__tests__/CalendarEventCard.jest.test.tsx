import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { createPrescriptionQuantificationBundleFixture } from "../../shared/__tests__/activityQuantificationFixture";
import { CalendarEventCard } from "../CalendarEventCard";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CalendarDays: mockCreateHost("CalendarDays"),
  Lock: mockCreateHost("Lock"),
  Play: mockCreateHost("Play"),
  Target: mockCreateHost("Target"),
  Zap: mockCreateHost("Zap"),
}));
jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityColor: () => ({ bg: "bg-primary", text: "text-primary" }),
}));
function renderCard(
  prescriptionQuantification: ReturnType<typeof createPrescriptionQuantificationBundleFixture>,
) {
  return renderNative(
    <CalendarEventCard
      canStart
      event={
        {
          id: "event-load",
          event_type: "planned",
          title: "Tempo builder",
          activity_plan: {
            id: "plan-load",
            name: "Tempo builder",
            activity_category: "run",
            estimated_duration: 88,
            intensity: 0.9,
            prescriptionQuantification,
          },
        } as never
      }
      onPress={jest.fn()}
    />,
  );
}

describe("CalendarEventCard common Load", () => {
  it("renders canonical Load and qualitative Intensity without TSS or IF", () => {
    renderCard(createPrescriptionQuantificationBundleFixture({ estimated: false }));

    expect(screen.getAllByText("Common Load 64").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Normalized intensity 0.80").length).toBeGreaterThan(0);
    expect(screen.queryByText(/TSS|\bIF\b|88|0\.9/)).toBeNull();
  });

  it("marks partial canonical metrics incomplete", () => {
    renderCard(createPrescriptionQuantificationBundleFixture({ status: "partial" }));

    expect(screen.getAllByText("Common Load 32 · Incomplete").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Normalized intensity 0.80 · Incomplete").length).toBeGreaterThan(0);
  });

  it("renders private canonical Load explicitly", () => {
    renderCard(createPrescriptionQuantificationBundleFixture({ status: "private" }));

    expect(screen.getAllByText("Common Load Private").length).toBeGreaterThan(0);
  });

  it("omits unsupported and noncanonical load instead of falling back to legacy estimates", () => {
    const rendered = renderCard(
      createPrescriptionQuantificationBundleFixture({ status: "unsupported" }),
    );

    expect(JSON.stringify(rendered.toJSON())).not.toMatch(/Load|Intensity|TSS|\bIF\b|88|0\.9/);
  });
});
