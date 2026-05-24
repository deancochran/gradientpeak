import { handleRecordingObjectAction } from "../recordingObjectActions";

jest.mock("react-native", () => ({
  __esModule: true,
  Alert: { alert: jest.fn() },
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: jest.fn() },
}));

describe("handleRecordingObjectAction", () => {
  it("returns to the recorder after attaching a plan", async () => {
    const navigateToRecord = jest.fn();
    const service = { selectPlan: jest.fn() } as any;
    const plan = {
      id: "plan-1",
      name: "Tempo",
      activity_category: "bike",
      route_id: null,
    } as any;

    await handleRecordingObjectAction({
      candidate: {
        objectKind: "activity_plan",
        objectId: "plan-1",
        plan,
      },
      command: "attach_plan",
      navigateToRecord,
      service,
    });

    expect(service.selectPlan).toHaveBeenCalledWith(plan);
    expect(navigateToRecord).toHaveBeenCalledTimes(1);
  });

  it("returns to the recorder after attaching a route", async () => {
    const navigateToRecord = jest.fn();
    const service = { attachRoute: jest.fn(async () => undefined) } as any;

    await handleRecordingObjectAction({
      candidate: {
        objectKind: "route",
        objectId: "route-1",
      },
      command: "attach_route",
      navigateToRecord,
      service,
    });

    expect(service.attachRoute).toHaveBeenCalledWith("route-1");
    expect(navigateToRecord).toHaveBeenCalledTimes(1);
  });
});
