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
async function renderCard(
  prescriptionQuantification: ReturnType<typeof createPrescriptionQuantificationBundleFixture>,
) {
  return await renderNative(
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
  it("marks calculated Load as estimated without inventing Intensity", async () => {
    await renderCard(createPrescriptionQuantificationBundleFixture({ estimated: false }));

    expect(screen.getAllByText("Common Load ~64").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Intensity/)).toBeNull();
    expect(screen.queryByText(/TSS|\bIF\b|88|0\.9/)).toBeNull();
  });

  it("renders partial planned Load as an em dash", async () => {
    await renderCard(createPrescriptionQuantificationBundleFixture({ status: "partial" }));

    expect(screen.getAllByText("Common Load —").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Intensity/)).toBeNull();
    expect(screen.queryByText(/partial|unavailable|incomplete/i)).toBeNull();
  });

  it("renders unavailable planned Load as an em dash", async () => {
    await renderCard(createPrescriptionQuantificationBundleFixture({ status: "private" }));

    expect(screen.getAllByText("Common Load —").length).toBeGreaterThan(0);
    expect(screen.queryByText(/private|unavailable|incomplete/i)).toBeNull();
  });

  it("renders unsupported planned Load as an em dash", async () => {
    const rendered = await renderCard(
      createPrescriptionQuantificationBundleFixture({ status: "unsupported" }),
    );

    expect(screen.getAllByText("Common Load —").length).toBeGreaterThan(0);
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(
      /TSS|\bIF\b|88|0\.9|unavailable|incomplete/i,
    );
  });
});
