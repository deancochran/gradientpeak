import {
  activityPlanSemanticHash,
  getCanonicalActivityPlanStructureHashInput,
  type RecordingServiceActivityPlan,
} from "@repo/core";
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
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .createHash("sha256")
      .update(value)
      .digest("hex"),
  ),
}));
const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const activityBlock = (activity_category: "run" | "bike", value: number) => ({
  type: "step" as const,
  name: activity_category,
  id: id(value + 200),
  duration: { type: "time" as const, seconds: 60 },
  targets: [{ type: "RPE" as const, intensity: 4 }],
});
const plan = (activity_category: "run" | "bike", items: unknown, idValue = "plan-1") =>
  ({
    id: idValue,
    name: "Tempo",
    structure: { version: 5, activity_category, items },
  }) as unknown as RecordingServiceActivityPlan & {
    id: string;
  };
const singleActivityCategoryPlan = () => plan("bike", [activityBlock("bike", 1)]);
const multisportPlan = () =>
  ({
    id: "plan-1",
    name: "Tempo",
    structure: {
      version: 3,
      segments: [
        { ...activityBlock("run", 1), activity_category: "run" },
        { ...activityBlock("bike", 2), activity_category: "bike" },
      ],
    },
  }) as unknown as RecordingServiceActivityPlan & {
    id: string;
  };
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
  it("passes scheduled provenance when attaching a prescribed plan", async () => {
    const navigateToRecord = jest.fn();
    const service = { selectPlan: jest.fn() } as unknown as ActivityRecorderService;
    const selectedPlan = plan("bike", [activityBlock("bike", 1)], id(702));
    const resolvedStructureHash = `v1:sha256:${jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .createHash("sha256")
      .update(getCanonicalActivityPlanStructureHashInput(selectedPlan.structure))
      .digest("hex")}`;
    const plannedSession = {
      id: id(700),
      sessionRevision: 3,
      source: { kind: "direct" as const, operationId: "recording-object-action-test-0001" },
      prescription: {
        resolutionManifest: {
          resolver_version: "prescription-resolver-v2" as const,
          policy_version: "training-plan-policy-v2" as const,
          training_plan_id: null,
          training_plan_revision: null,
          training_plan_hash: null,
          athlete_context_revision: null,
          activity_plan_id: selectedPlan.id,
          activity_plan_revision: 2,
          activity_plan_semantic_hash: activityPlanSemanticHash({
            structure: selectedPlan.structure,
            trainingIntent: "aerobic_base",
          }),
          effective_target_duration_minutes: null,
          effective_target_common_load: null,
          evidence_facts: [],
          session_demand: {
            activity_category: selectedPlan.structure.activity_category,
            training_intent: "aerobic_base" as const,
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal" as const,
          },
          fallback_level: "system_default_no_context" as const,
          reason_codes: [],
          resolved_structure: selectedPlan.structure,
          resolved_structure_hash: resolvedStructureHash,
          prescription_estimate: {
            duration: { status: "unavailable" as const, value_seconds: null },
            common_load: { status: "unavailable" as const, value: null },
            rest_seconds: 0,
            has_open_completion: false,
            warnings: [],
            factors: [],
          },
          fingerprint: `v1:sha256:${"2".repeat(64)}`,
        },
        capturedAt: "2026-09-11T12:00:00.000Z",
      },
    };
    await handleRecordingObjectAction({
      candidate: {
        objectKind: "activity_plan",
        objectId: selectedPlan.id,
        plan: selectedPlan,
        eventId: id(701),
        plannedSession,
      },
      command: "attach_plan",
      navigateToRecord,
      service,
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(service.selectPlan).toHaveBeenCalledWith(selectedPlan, id(701), plannedSession);
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
  it("starts plan and route recordings with GPS capture disabled", async () => {
    const navigateToRecord = jest.fn();
    await handleRecordingObjectAction({
      candidate: {
        objectKind: "activity_plan",
        objectId: "plan-1",
        plan: singleActivityCategoryPlan(),
      },
      command: "start_with_plan",
      navigateToRecord,
      service: null,
    });
    await handleRecordingObjectAction({
      candidate: {
        objectKind: "route",
        objectId: "route-1",
        activity_category: "run",
      },
      command: "start_with_route",
      navigateToRecord,
      service: null,
    });
    expect(activitySelectionStore.setSelection).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ launchSource: "activity_plan", gpsRecordingEnabled: false }),
    );
    expect(activitySelectionStore.setSelection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ launchSource: "route", gpsRecordingEnabled: false }),
    );
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
  it("does not offer plan replacement after recording starts", () => {
    const currentPlan = plan("bike", [activityBlock("bike", 1)], id(801));
    const replacement = plan("bike", [activityBlock("bike", 1)], id(802));
    const service = { plan: currentPlan } as unknown as ActivityRecorderService;
    expect(
      resolveRecordingObjectAction({
        candidate: {
          objectKind: "activity_plan",
          objectId: replacement.id ?? "",
          plan: replacement,
        },
        lifecycle: "active",
        service,
      }),
    ).toMatchObject({ primaryAction: "disabled", command: null, label: "Plan locked" });
  });
});
