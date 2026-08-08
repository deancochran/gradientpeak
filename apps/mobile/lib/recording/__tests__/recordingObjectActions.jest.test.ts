import type { RecordingServiceActivityPlan } from "@repo/core";
import { Alert } from "react-native";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import {
  handleRecordingObjectAction,
  resolveRecordingObjectAction,
} from "../recordingObjectActions";

jest.mock("react-native", () => ({
  __esModule: true,
  Alert: { alert: jest.fn() },
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: jest.fn() },
}));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const activitySegment = (activity_category: "run" | "bike", value: number) => ({
  id: id(value),
  role: "activity" as const,
  name: activity_category,
  intervals: [
    {
      id: id(value + 100),
      name: activity_category,
      repetitions: 1,
      steps: [
        {
          id: id(value + 200),
          name: activity_category,
          duration: { type: "time" as const, seconds: 60 },
          targets: [{ type: "RPE" as const, intensity: 4 }],
        },
      ],
    },
  ],
});

const plan = (activity_category: "run" | "bike", segments: unknown, idValue = "plan-1") =>
  ({
    id: idValue,
    name: "Tempo",
    structure: { version: 3, activity_category, segments },
  }) as unknown as RecordingServiceActivityPlan & { id: string };

const singleActivityCategoryPlan = () => plan("bike", [activitySegment("bike", 1)]);
const multisportPlan = () =>
  ({
    id: "plan-1",
    name: "Tempo",
    structure: {
      version: 3,
      segments: [
        { ...activitySegment("run", 1), activity_category: "run" },
        { ...activitySegment("bike", 2), activity_category: "bike" },
      ],
    },
  }) as unknown as RecordingServiceActivityPlan & { id: string };

describe("handleRecordingObjectAction", () => {
  it("returns to the recorder after attaching a plan", async () => {
    const navigateToRecord = jest.fn();
    const service = { selectPlan: jest.fn() } as unknown as ActivityRecorderService;
    const selectedPlan = singleActivityCategoryPlan();
    const { id: planId, ...planWithoutId } = selectedPlan;

    await handleRecordingObjectAction({
      candidate: {
        objectKind: "activity_plan",
        objectId: "plan-1",
        plan: {
          ...planWithoutId,
          ...(planId === undefined ? {} : { id: planId }),
        },
      },
      command: "attach_plan",
      navigateToRecord,
      service,
    });

    expect(service.selectPlan).toHaveBeenCalledWith(selectedPlan);
    expect(navigateToRecord).toHaveBeenCalledTimes(1);
  });

  it("returns to the recorder after attaching a route", async () => {
    const navigateToRecord = jest.fn();
    const service = {
      attachRoute: jest.fn(async () => undefined),
    } as unknown as ActivityRecorderService;

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

  it("disables a malformed plan while idle", () => {
    const resolution = resolveRecordingObjectAction({
      candidate: { objectKind: "activity_plan", objectId: "plan-1", plan: multisportPlan() },
      lifecycle: "idle",
      service: null,
    });

    expect(resolution).toMatchObject({
      primaryAction: "disabled",
      command: null,
      disabledReason: "This plan can't be recorded on mobile. Check the plan and try again.",
    });
  });

  it("does not let bypassed start or attach commands select an unsupported plan", async () => {
    const navigateToRecord = jest.fn();
    const service = { selectPlan: jest.fn() } as unknown as ActivityRecorderService;
    const candidate = {
      objectKind: "activity_plan" as const,
      objectId: "plan-1",
      plan: multisportPlan(),
    };

    await handleRecordingObjectAction({
      candidate,
      command: "start_with_plan",
      navigateToRecord,
      service,
    });
    await handleRecordingObjectAction({
      candidate,
      command: "attach_plan",
      navigateToRecord,
      service,
    });

    expect(activitySelectionStore.setSelection).not.toHaveBeenCalled();
    expect(service.selectPlan).not.toHaveBeenCalled();
    expect(navigateToRecord).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
  });

  it("preserves selected and return actions for an already-selected unsupported plan", () => {
    const selectedPlan = multisportPlan();
    const service = { plan: selectedPlan } as unknown as ActivityRecorderService;
    const candidate = {
      objectKind: "activity_plan" as const,
      objectId: "plan-1",
      plan: selectedPlan,
    };

    expect(resolveRecordingObjectAction({ candidate, lifecycle: "setup", service })).toMatchObject({
      primaryAction: "selected",
      label: "Selected for Recording",
    });
    expect(resolveRecordingObjectAction({ candidate, lifecycle: "active", service })).toMatchObject(
      { primaryAction: "selected", secondaryActions: ["return"] },
    );
  });
});
