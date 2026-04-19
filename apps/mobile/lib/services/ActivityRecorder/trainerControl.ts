import {
  BLE_SERVICE_UUIDS,
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
  RecordingTrainerControlState,
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
  private controlState: RecordingTrainerControlState = "not_applicable";
  private lastCommandStatus: RecordingTrainerCommandStatus | null = null;
  private hadControllableTrainer = false;

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

  public getControlState(): RecordingTrainerControlState {
    this.syncControlState();
    return this.controlState;
  }

  public getLastCommandStatus(): RecordingTrainerCommandStatus | null {
    const controllerStatus = this.deps.sensorsManager.getLastTrainerCommandStatus();
    if (controllerStatus) {
      this.lastCommandStatus = controllerStatus;
    }
    return this.lastCommandStatus;
  }

  public handleSensorConnectionChange(sensor: ConnectedSensor): void {
    if (!this.isFtmsCandidate(sensor)) {
      this.syncControlState();
      return;
    }

    if (sensor.connectionState === "connecting") {
      this.controlState = this.hadControllableTrainer ? "recovering_control" : "requesting_control";
      return;
    }

    if (sensor.connectionState === "connected") {
      this.controlState = sensor.isControllable ? "controllable" : "control_rejected";
      this.hadControllableTrainer = this.hadControllableTrainer || Boolean(sensor.isControllable);
      if (sensor.isControllable) {
        this.captureControllerStatus();
      }
      return;
    }

    if (sensor.connectionState === "disconnected" || sensor.connectionState === "failed") {
      this.syncControlState();
    }
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
      this.controlState = "recovering_control";
    }

    if (this.isManualMode()) {
      if (source === "reconnect_recovery") {
        this.recoveryState = "idle";
      }
      return;
    }

    const resolution = resolvePlanStepTrainerIntents({
      step,
      profileSnapshot: this.deps.getSessionSnapshot()?.profileSnapshot,
      source,
    });

    const trainer = this.requireControlReady(
      source,
      resolution.intents[0] ? mapIntentToCommandType(resolution.intents[0]) : "request_control",
    );
    if (!trainer) {
      if (source === "reconnect_recovery") {
        this.recoveryState = "failed";
      }
      return;
    }

    for (const unresolved of resolution.unresolvedTargets) {
      this.deps.onError(`Unable to resolve workout target: ${unresolved.type}`);
    }

    for (const intent of resolution.intents) {
      const success = await this.dispatchIntent(intent, trainer);
      this.captureControllerStatus();
      if (!success) {
        if (source === "reconnect_recovery") {
          this.recoveryState = "failed";
          this.controlState = this.controlState === "controllable" ? "failed" : this.controlState;
        }
        if (shouldReportCommandErrors(source)) {
          this.deps.onError(`Failed to apply trainer command: ${intent.type}`);
        }
        return;
      }
    }

    if (source === "reconnect_recovery") {
      this.recoveryState = "recovered";
      this.controlState = "controllable";
    } else if (this.recoveryState !== "idle") {
      this.recoveryState = "idle";
    }
  }

  public async applyRouteGrade(percent: number): Promise<void> {
    if (this.isManualMode()) {
      return;
    }

    const trainer = this.requireControlReady("periodic_refinement", "set_incline");
    if (!trainer?.ftmsFeatures?.inclinationTargetSettingSupported) {
      return;
    }

    const success = await this.deps.sensorsManager.setTargetInclination(percent, {
      source: "periodic_refinement",
      coalesceKey: "route_grade",
    });
    this.captureControllerStatus();
    if (!success) {
      this.deps.onError(`Failed to set route grade: ${percent.toFixed(1)}%`);
    }
  }

  private async applyManualIntent(intent: RecordingTrainerControlIntent): Promise<boolean> {
    const trainer = this.requireControlReady(intent.source, mapIntentToCommandType(intent));
    if (!trainer) {
      this.deps.onError("Trainer control is not ready.");
      return false;
    }

    const success = await this.dispatchIntent(intent, trainer);
    this.captureControllerStatus();

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
          : this.recordUnsupportedIntent(intent, trainer);
      case "set_cadence":
        return trainer.ftmsFeatures?.targetedCadenceSupported
          ? this.deps.sensorsManager.setTargetCadence(intent.rpm, {
              source: intent.source,
              coalesceKey: intent.type,
            })
          : this.recordUnsupportedIntent(intent, trainer);
      case "set_incline":
        return trainer.ftmsFeatures?.inclinationTargetSettingSupported
          ? this.deps.sensorsManager.setTargetInclination(intent.inclinePercent, {
              source: intent.source,
              coalesceKey: intent.type,
            })
          : this.recordUnsupportedIntent(intent, trainer);
      case "set_resistance":
        return trainer.ftmsFeatures?.resistanceTargetSettingSupported
          ? this.deps.sensorsManager.setResistanceTarget(intent.resistance, {
              source: intent.source,
              coalesceKey: intent.type,
            })
          : this.recordUnsupportedIntent(intent, trainer);
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
          : this.recordUnsupportedIntent(intent, trainer);
    }
  }

  private requireControlReady(
    source: RecordingTrainerIntentSource,
    commandType: RecordingTrainerCommandStatus["commandType"],
  ): ConnectedSensor | null {
    this.syncControlState();

    const trainer = this.deps.sensorsManager.getControllableTrainer();
    if (trainer) {
      this.controlState = "controllable";
      this.hadControllableTrainer = true;
      return trainer;
    }

    this.lastCommandStatus = {
      source,
      commandType,
      controlMode: null,
      outcome: "control_unavailable",
      success: false,
      errorMessage: "Trainer control is not available.",
      resultCodeName: "Trainer control is not available.",
      queuedAt: Date.now(),
      completedAt: Date.now(),
    };
    this.deps.onCommandStatus?.(this.lastCommandStatus);

    if (this.controlState === "requesting_control" || this.controlState === "recovering_control") {
      return null;
    }

    this.controlState = this.hasEligibleTrainerCandidate()
      ? "eligible"
      : this.hadControllableTrainer
        ? "control_lost"
        : "not_applicable";
    return null;
  }

  private syncControlState(): void {
    const trainer = this.deps.sensorsManager.getControllableTrainer();
    if (trainer) {
      this.controlState = "controllable";
      this.hadControllableTrainer = true;
      return;
    }

    if (this.recoveryState === "applying_reconnect_recovery") {
      this.controlState = "recovering_control";
      return;
    }

    if (this.hasEligibleTrainerCandidate()) {
      if (this.controlState !== "control_rejected" && this.controlState !== "failed") {
        this.controlState = "eligible";
      }
      return;
    }

    this.controlState = this.hadControllableTrainer ? "control_lost" : "not_applicable";
  }

  private hasEligibleTrainerCandidate(): boolean {
    return this.deps.sensorsManager
      .getConnectedSensors()
      .some((sensor) => this.isFtmsCandidate(sensor));
  }

  private isFtmsCandidate(sensor: ConnectedSensor): boolean {
    const ftmsService = BLE_SERVICE_UUIDS.FITNESS_MACHINE.toLowerCase();
    return sensor.services.some((service) => service.toLowerCase() === ftmsService);
  }

  private captureControllerStatus(): void {
    const status = this.deps.sensorsManager.getLastTrainerCommandStatus();
    if (!status) {
      return;
    }

    this.lastCommandStatus = status;
    if (!status.success && status.outcome === "control_conflict") {
      this.controlState = "control_lost";
    } else if (status.success) {
      this.controlState = "controllable";
      this.hadControllableTrainer = true;
    }
    this.deps.onCommandStatus?.(status);
  }

  private recordUnsupportedIntent(
    intent: RecordingTrainerControlIntent,
    trainer: ConnectedSensor,
  ): boolean {
    this.lastCommandStatus = {
      source: intent.source,
      commandType: mapIntentToCommandType(intent),
      controlMode: trainer.ftmsController?.getCurrentMode() ?? trainer.currentControlMode ?? null,
      outcome: "unsupported",
      targetValue: getIntentTargetValue(intent),
      success: false,
      errorMessage: `Trainer does not support ${intent.type}`,
      resultCodeName: `Trainer does not support ${intent.type}`,
      queuedAt: Date.now(),
      completedAt: Date.now(),
    };
    this.deps.onCommandStatus?.(this.lastCommandStatus);
    return false;
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

function mapIntentToCommandType(
  intent: RecordingTrainerControlIntent,
): RecordingTrainerCommandStatus["commandType"] {
  switch (intent.type) {
    case "set_power":
      return "set_power";
    case "set_speed":
      return "set_speed";
    case "set_cadence":
      return "set_cadence";
    case "set_incline":
      return "set_incline";
    case "set_resistance":
      return "set_resistance";
    case "set_simulation":
      return "set_simulation";
  }
}

function shouldReportCommandErrors(source: RecordingTrainerIntentSource): boolean {
  return source !== "periodic_refinement";
}

function getIntentTargetValue(intent: RecordingTrainerControlIntent): number | undefined {
  switch (intent.type) {
    case "set_power":
      return intent.watts;
    case "set_speed":
      return metersPerSecondToKph(intent.metersPerSecond);
    case "set_cadence":
      return intent.rpm;
    case "set_incline":
      return intent.inclinePercent;
    case "set_resistance":
      return intent.resistance;
    case "set_simulation":
      return intent.gradePercent;
  }
}
