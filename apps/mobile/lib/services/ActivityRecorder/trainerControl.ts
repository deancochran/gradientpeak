import {
  type IntervalStepV2,
  metersPerSecondToKph,
  type RecordingTrainerControlIntent,
  type RecordingTrainerIntentSource,
  type RecordingTrainerMachineType,
  resolvePlanStepTrainerIntents,
} from "@repo/core";
import { PredictiveResistanceCalculator } from "./PredictiveResistanceCalculator";
import type { ConnectedSensor, SensorsManager } from "./sensors";
import type {
  CurrentReadings,
  RecordingSessionOverrideState,
  RecordingSessionSnapshot,
  RecordingTrainerCommandStatus,
  RecordingTrainerRecoveryState,
} from "./types";

interface TrainerControlDependencies {
  sensorsManager: SensorsManager;
  getCurrentReadings: () => CurrentReadings;
  getSessionOverrideState: () => RecordingSessionOverrideState;
  getSessionSnapshot: () => RecordingSessionSnapshot | null;
  onCommandStatus?: (status: RecordingTrainerCommandStatus | null) => void;
  onError: (message: string) => void;
}

export class TrainerControl {
  private readonly predictiveCalculator = new PredictiveResistanceCalculator();
  private recoveryState: RecordingTrainerRecoveryState = "idle";

  constructor(private readonly deps: TrainerControlDependencies) {}

  public isManualMode(): boolean {
    return this.deps.getSessionOverrideState().trainerMode === "manual";
  }

  public resetAdaptiveState(): void {
    this.predictiveCalculator.reset();
  }

  public getRecoveryState(): RecordingTrainerRecoveryState {
    return this.recoveryState;
  }

  public async applyManualPower(watts: number): Promise<boolean> {
    return this.applyManualIntent({ type: "set_power", watts, source: "manual" });
  }

  public async applyManualResistance(resistance: number): Promise<boolean> {
    return this.applyManualIntent({
      type: "set_resistance",
      resistance,
      source: "manual",
    });
  }

  public async applyManualSimulation(params: {
    gradePercent: number;
    windSpeedMps: number;
    rollingResistanceCoefficient?: number;
    aerodynamicDragCoefficient?: number;
  }): Promise<boolean> {
    return this.applyManualIntent({
      type: "set_simulation",
      gradePercent: params.gradePercent,
      windSpeedMps: params.windSpeedMps,
      rollingResistanceCoefficient: params.rollingResistanceCoefficient ?? 0.005,
      aerodynamicDragCoefficient: params.aerodynamicDragCoefficient ?? 0.51,
      source: "manual",
    });
  }

  public async applyManualSpeed(speedKph: number): Promise<boolean> {
    return this.applyManualIntent({
      type: "set_speed",
      metersPerSecond: speedKph / 3.6,
      source: "manual",
    });
  }

  public async applyManualIncline(inclinePercent: number): Promise<boolean> {
    return this.applyManualIntent({
      type: "set_incline",
      inclinePercent,
      source: "manual",
    });
  }

  public async applyManualCadence(rpm: number): Promise<boolean> {
    return this.applyManualIntent({
      type: "set_cadence",
      rpm,
      source: "manual",
    });
  }

  public async applyStepTargets(
    step: IntervalStepV2,
    source: RecordingTrainerIntentSource,
  ): Promise<void> {
    if (source === "reconnect_recovery") {
      this.recoveryState = "applying_reconnect_recovery";
    }

    if (this.isManualMode()) {
      if (source === "reconnect_recovery") {
        this.recoveryState = "idle";
      }
      return;
    }

    const trainer = this.deps.sensorsManager.getControllableTrainer();
    if (!trainer) {
      return;
    }

    const resolution = resolvePlanStepTrainerIntents({
      step,
      profileSnapshot: this.deps.getSessionSnapshot()?.profileSnapshot,
      source,
    });

    for (const unresolved of resolution.unresolvedTargets) {
      this.deps.onError(`Unable to resolve workout target: ${unresolved.type}`);
    }

    for (const intent of resolution.intents) {
      const success = await this.dispatchIntent(intent, trainer);
      this.deps.onCommandStatus?.(this.deps.sensorsManager.getLastTrainerCommandStatus());
      if (!success) {
        if (source === "reconnect_recovery") {
          this.recoveryState = "failed";
        }
        this.deps.onError(`Failed to apply trainer command: ${intent.type}`);
        return;
      }
    }

    if (source === "reconnect_recovery") {
      this.recoveryState = "recovered";
    } else if (this.recoveryState !== "idle") {
      this.recoveryState = "idle";
    }
  }

  public async applyRouteGrade(percent: number): Promise<void> {
    if (this.isManualMode()) {
      return;
    }

    const trainer = this.deps.sensorsManager.getControllableTrainer();
    if (!trainer?.ftmsFeatures?.inclinationTargetSettingSupported) {
      return;
    }

    const success = await this.deps.sensorsManager.setTargetInclination(percent, {
      source: "periodic_refinement",
      coalesceKey: "route_grade",
    });
    this.deps.onCommandStatus?.(this.deps.sensorsManager.getLastTrainerCommandStatus());
    if (!success) {
      this.deps.onError(`Failed to set route grade: ${percent.toFixed(1)}%`);
    }
  }

  private async applyManualIntent(intent: RecordingTrainerControlIntent): Promise<boolean> {
    const trainer = this.deps.sensorsManager.getControllableTrainer();
    if (!trainer) {
      this.deps.onError("No controllable trainer connected.");
      return false;
    }

    const success = await this.dispatchIntent(intent, trainer);
    this.deps.onCommandStatus?.(this.deps.sensorsManager.getLastTrainerCommandStatus());

    if (!success) {
      this.deps.onError(`Failed to apply trainer command: ${intent.type}`);
    }

    return success;
  }

  private async dispatchIntent(
    intent: RecordingTrainerControlIntent,
    trainer: ConnectedSensor,
  ): Promise<boolean> {
    switch (intent.type) {
      case "set_power":
        return this.applyPowerIntent(intent, trainer);
      case "set_speed":
        return trainer.ftmsFeatures?.speedTargetSettingSupported
          ? this.deps.sensorsManager.setTargetSpeed(metersPerSecondToKph(intent.metersPerSecond), {
              source: intent.source,
              coalesceKey: intent.type,
            })
          : false;
      case "set_cadence":
        return trainer.ftmsFeatures?.targetedCadenceSupported
          ? this.deps.sensorsManager.setTargetCadence(intent.rpm, {
              source: intent.source,
              coalesceKey: intent.type,
            })
          : false;
      case "set_incline":
        return trainer.ftmsFeatures?.inclinationTargetSettingSupported
          ? this.deps.sensorsManager.setTargetInclination(intent.inclinePercent, {
              source: intent.source,
              coalesceKey: intent.type,
            })
          : false;
      case "set_resistance":
        return trainer.ftmsFeatures?.resistanceTargetSettingSupported
          ? this.deps.sensorsManager.setResistanceTarget(intent.resistance, {
              source: intent.source,
              coalesceKey: intent.type,
            })
          : false;
      case "set_simulation":
        return trainer.ftmsFeatures?.indoorBikeSimulationSupported
          ? this.deps.sensorsManager.setSimulation(
              {
                grade: intent.gradePercent,
                windSpeed: intent.windSpeedMps,
                crr: intent.rollingResistanceCoefficient,
                windResistance: intent.aerodynamicDragCoefficient,
              },
              {
                source: intent.source,
                coalesceKey: intent.type,
              },
            )
          : false;
    }
  }

  private async applyPowerIntent(
    intent: Extract<RecordingTrainerControlIntent, { type: "set_power" }>,
    trainer: ConnectedSensor,
  ): Promise<boolean> {
    if (trainer.ftmsFeatures?.powerTargetSettingSupported) {
      return this.deps.sensorsManager.setPowerTarget(intent.watts, {
        source: intent.source,
        coalesceKey: intent.type,
      });
    }

    if (!trainer.ftmsFeatures?.resistanceTargetSettingSupported) {
      return false;
    }

    const machineType = inferTrainerMachineType(trainer);
    if (!machineType || machineType === "treadmill" || machineType === "generic") {
      return false;
    }

    const currentCadence =
      this.deps.getCurrentReadings().cadence ?? getFallbackCadence(machineType);
    const resistance = this.predictiveCalculator.calculateResistance(
      intent.watts,
      currentCadence,
      machineType,
      trainer.ftmsFeatures,
    );

    return this.deps.sensorsManager.setResistanceTarget(resistance, {
      source: intent.source,
      coalesceKey: intent.type,
    });
  }
}

function inferTrainerMachineType(
  trainer: ConnectedSensor | undefined,
): RecordingTrainerMachineType | null {
  const features = trainer?.ftmsFeatures;
  if (!features) return null;

  if (features.indoorBikeSimulationSupported && features.powerTargetSettingSupported) {
    return "bike";
  }

  if (features.speedTargetSettingSupported && features.inclinationTargetSettingSupported) {
    return "treadmill";
  }

  if (features.resistanceTargetSettingSupported && features.stepCountSupported) {
    return "elliptical";
  }

  if (features.resistanceTargetSettingSupported && features.cadenceSupported) {
    return "rower";
  }

  if (features.powerTargetSettingSupported || features.resistanceTargetSettingSupported) {
    return "bike";
  }

  return null;
}

function getFallbackCadence(machineType: RecordingTrainerMachineType): number {
  switch (machineType) {
    case "rower":
      return 22;
    case "elliptical":
      return 60;
    case "bike":
      return 85;
    case "treadmill":
      return 0;
    case "generic":
      return 85;
  }
}

export { inferTrainerMachineType };
