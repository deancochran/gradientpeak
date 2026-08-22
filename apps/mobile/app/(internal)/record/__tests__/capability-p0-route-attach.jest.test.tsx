import {
  handleRecordingObjectAction,
  resolveRecordingObjectAction,
} from "../../../../lib/recording/recordingObjectActions";

describe("P0 route attachment boundary", () => {
  it("selects attach when setup is idle and invokes the recorder service with the route ID", async () => {
    const service = { attachRoute: jest.fn(async () => undefined) };
    const candidate = { objectKind: "route" as const, objectId: "route-1", label: "River Loop" };
    const action = resolveRecordingObjectAction({ candidate, lifecycle: "setup", service });

    expect(action).toMatchObject({ command: "attach_route", primaryAction: "attach" });
    await handleRecordingObjectAction({
      candidate,
      command: action.command,
      navigateToRecord: jest.fn(),
      service,
    });
    expect(service.attachRoute).toHaveBeenCalledWith("route-1");
  });

  it("does not offer attachment without an available recorder service", () => {
    const action = resolveRecordingObjectAction({
      lifecycle: "setup",
      service: null,
      candidate: {
        objectKind: "route",
        objectId: "route-1",
        label: "River Loop",
        canReadGeometry: false,
      },
    });
    expect(action.primaryAction).toBe("disabled");
    expect(action.command).toBeNull();
  });
});
