import React from "react";
import { renderNative, screen } from "../../../test/render-native";
import { CalendarEventPreviewSheet } from "../CalendarEventPreviewSheet";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: createHost("ArrowUpRight"),
  Pencil: createHost("Pencil"),
  Play: createHost("Play"),
  Trash2: createHost("Trash2"),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("@/lib/calendar/eventRouting", () => ({
  __esModule: true,
  buildOpenEventRoute: () => "/event-detail?id=event-1",
}));

const baseEvent = {
  id: "event-1",
  event_type: "planned",
  title: "Tempo Builder",
  starts_at: "2026-03-23T09:00:00.000Z",
  activity_plan: {
    id: "plan-1",
    estimated_tss: 72,
    estimated_duration: 3600,
    structure: { intervals: [{ repetitions: 1, steps: [{}] }] },
  },
};

describe("CalendarEventPreviewSheet", () => {
  it("renders a compact planned activity preview for planned events", () => {
    const rendered = renderNative(
      <CalendarEventPreviewSheet
        event={baseEvent as any}
        visible
        onClose={jest.fn()}
        onOpenDetail={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onMove={jest.fn()}
        onStart={jest.fn()}
      />,
    );

    expect(
      (rendered as any).UNSAFE_getByType("ActivityPlanContentPreview").props.testIDPrefix,
    ).toBe("calendar-preview-plan");
    expect(screen.getByTestId("calendar-preview-start")).toBeTruthy();
  });
});
