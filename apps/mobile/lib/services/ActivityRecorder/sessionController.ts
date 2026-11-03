import {
  type RecordingConfiguration,
  type RecordingControlPolicy,
  RecordingSessionStateController,
} from "@repo/core";
import type {
  CurrentReadings,
  RecordingPlanView,
  RecordingSessionView,
  RecordingTrainerView,
  SessionStats,
} from "./types";

export interface SessionViewInputs {
  trainer: RecordingTrainerView;
  currentReadings: CurrentReadings;
  sessionStats: SessionStats;
  recordingConfiguration: RecordingConfiguration;
  trainerControlPolicy: RecordingControlPolicy;
  plan: RecordingPlanView;
}

export class RecordingSessionController extends RecordingSessionStateController<SessionViewInputs> {
  public override buildView(inputs: SessionViewInputs): RecordingSessionView {
    return super.buildView(inputs);
  }
}
