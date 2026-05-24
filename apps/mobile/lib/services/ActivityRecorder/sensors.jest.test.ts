jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  BLE_SERVICE_UUIDS: {
    HEART_RATE: "heart-rate",
    CYCLING_SPEED_AND_CADENCE: "csc",
    CYCLING_POWER: "cycling-power",
    RUNNING_SPEED_AND_CADENCE: "running-speed-and-cadence",
    FITNESS_MACHINE: "fitness-machine",
  },
  FTMS_CHARACTERISTICS: {
    FEATURE: "ftms-feature",
    STATUS: "ftms-status",
    TRAINING_STATUS: "ftms-training-status",
    CONTROL_POINT: "ftms-control-point",
    TREADMILL_DATA: "ftms-treadmill-data",
    CROSS_TRAINER_DATA: "ftms-cross-trainer-data",
    STEP_CLIMBER_DATA: "ftms-step-climber-data",
    STAIR_CLIMBER_DATA: "ftms-stair-climber-data",
    ROWER_DATA: "ftms-rower-data",
    INDOOR_BIKE_DATA: "ftms-indoor-bike-data",
    SUPPORTED_SPEED_RANGE: "ftms-supported-speed-range",
    SUPPORTED_INCLINATION_RANGE: "ftms-supported-inclination-range",
    SUPPORTED_HEART_RATE_RANGE: "ftms-supported-heart-rate-range",
    SUPPORTED_POWER_RANGE: "ftms-supported-power-range",
    SUPPORTED_RESISTANCE_LEVEL_RANGE: "ftms-supported-resistance-range",
  },
  ControlMode: {
    ERG: "erg",
    SIM: "sim",
    RESISTANCE: "resistance",
    SPEED: "speed",
    INCLINATION: "inclination",
    HEART_RATE: "heart_rate",
    CADENCE: "cadence",
  },
  FTMS_FEATURE_BITS: {
    AVERAGE_SPEED_SUPPORTED: 0,
    CADENCE_SUPPORTED: 1,
    TOTAL_DISTANCE_SUPPORTED: 2,
    INCLINATION_SUPPORTED: 3,
    ELEVATION_GAIN_SUPPORTED: 4,
    PACE_SUPPORTED: 5,
    STEP_COUNT_SUPPORTED: 6,
    RESISTANCE_LEVEL_SUPPORTED: 7,
    STRIDE_COUNT_SUPPORTED: 8,
    EXPENDED_ENERGY_SUPPORTED: 9,
    HEART_RATE_MEASUREMENT_SUPPORTED: 10,
    METABOLIC_EQUIVALENT_SUPPORTED: 11,
    ELAPSED_TIME_SUPPORTED: 12,
    REMAINING_TIME_SUPPORTED: 13,
    POWER_MEASUREMENT_SUPPORTED: 14,
    FORCE_ON_BELT_SUPPORTED: 15,
    USER_DATA_RETENTION_SUPPORTED: 16,
  },
  FTMS_TARGET_SETTING_BITS: {
    SPEED_TARGET_SETTING_SUPPORTED: 0,
    INCLINATION_TARGET_SETTING_SUPPORTED: 1,
    RESISTANCE_TARGET_SETTING_SUPPORTED: 2,
    POWER_TARGET_SETTING_SUPPORTED: 3,
    HEART_RATE_TARGET_SETTING_SUPPORTED: 4,
    TARGETED_EXPENDED_ENERGY_SUPPORTED: 5,
    TARGETED_STEP_NUMBER_SUPPORTED: 6,
    TARGETED_STRIDE_NUMBER_SUPPORTED: 7,
    TARGETED_DISTANCE_SUPPORTED: 8,
    TARGETED_TRAINING_TIME_SUPPORTED: 9,
    TARGETED_TIME_TWO_HR_ZONES_SUPPORTED: 10,
    TARGETED_TIME_THREE_HR_ZONES_SUPPORTED: 11,
    TARGETED_TIME_FIVE_HR_ZONES_SUPPORTED: 12,
    INDOOR_BIKE_SIMULATION_SUPPORTED: 13,
    WHEEL_CIRCUMFERENCE_SUPPORTED: 14,
    SPIN_DOWN_CONTROL_SUPPORTED: 15,
    TARGETED_CADENCE_SUPPORTED: 16,
  },
  FTMS_OPCODES: {
    REQUEST_CONTROL: 0,
    RESET: 1,
    SET_TARGET_SPEED: 2,
    SET_TARGET_INCLINATION: 3,
    SET_TARGET_RESISTANCE: 4,
    SET_TARGET_POWER: 5,
    SET_TARGET_HEART_RATE: 6,
    SET_INDOOR_BIKE_SIMULATION: 17,
    SET_TARGETED_CADENCE: 20,
    RESPONSE_CODE: 128,
  },
  FTMS_RESULT_CODES: {
    SUCCESS: 1,
    NOT_SUPPORTED: 2,
    INVALID_PARAMETER: 3,
    OPERATION_FAILED: 4,
    CONTROL_NOT_PERMITTED: 5,
  },
  canTrainerIntentPreempt: jest.fn(() => false),
  detectFtmsMachineType: jest.fn(({ characteristicUuids }) => {
    const present = new Set(characteristicUuids ?? []);
    if (present.has("ftms-treadmill-data")) {
      return { machineType: "treadmill", source: "data_characteristic" };
    }
    if (present.has("ftms-rower-data")) {
      return { machineType: "rower", source: "data_characteristic" };
    }
    if (present.has("ftms-indoor-bike-data")) {
      return { machineType: "bike", source: "data_characteristic" };
    }
    return { machineType: "unknown", source: "unknown" };
  }),
  listFtmsParserDefinitions: jest.fn(() => [
    {
      uuid: "ftms-treadmill-data",
      name: "Treadmill Data",
      kind: "measurement",
      machineType: "treadmill",
      parse: jest.fn(() => ({
        kind: "measurement",
        characteristicUuid: "ftms-treadmill-data",
        machineType: "treadmill",
        metrics: {
          hrBpm: null,
          powerWatts: null,
          cadenceRpm: null,
          speedMps: null,
          distanceMeters: null,
          elapsedTimeSeconds: null,
          energyKcal: null,
          stepCount: null,
          strideCount: null,
          floorCount: null,
          inclinationPercent: null,
          resistanceLevel: null,
          strokeRateSpm: null,
          strokeCount: null,
        },
        status: null,
        diagnostics: { truncated: false, bytesRead: 0, byteLength: 0 },
      })),
    },
    {
      uuid: "ftms-indoor-bike-data",
      name: "Indoor Bike Data",
      kind: "measurement",
      machineType: "bike",
      parse: jest.fn(() => ({
        kind: "measurement",
        characteristicUuid: "ftms-indoor-bike-data",
        machineType: "bike",
        metrics: {
          speedMps: 8.5,
          cadenceRpm: 91,
          powerWatts: 245,
          hrBpm: 151,
          distanceMeters: null,
          elapsedTimeSeconds: null,
          energyKcal: null,
          stepCount: null,
          strideCount: null,
          floorCount: null,
          inclinationPercent: null,
          resistanceLevel: null,
          strokeRateSpm: null,
          strokeCount: null,
        },
        status: null,
        diagnostics: { truncated: false, bytesRead: 2, byteLength: 2 },
      })),
    },
    {
      uuid: "ftms-status",
      name: "Fitness Machine Status",
      kind: "machine_status",
      machineType: "unknown",
      parse: jest.fn(() => ({
        kind: "machine_status",
        characteristicUuid: "ftms-status",
        machineType: "unknown",
        metrics: {
          hrBpm: null,
          powerWatts: null,
          cadenceRpm: null,
          speedMps: null,
          distanceMeters: null,
          elapsedTimeSeconds: null,
          energyKcal: null,
          stepCount: null,
          strideCount: null,
          floorCount: null,
          inclinationPercent: null,
          resistanceLevel: null,
          strokeRateSpm: null,
          strokeCount: null,
        },
        status: { code: 1, label: "Reset" },
        diagnostics: { truncated: false, bytesRead: 1, byteLength: 1 },
      })),
    },
  ]),
  parseCscMeasurement: jest.fn(() => null),
  parseCyclingPowerMeasurement: jest.fn(() => null),
  parseFtmsIndoorBikeData: jest.fn(() => ({
    speedMps: 8.5,
    cadenceRpm: 91,
    powerWatts: 245,
    hrBpm: 151,
    truncated: false,
  })),
  parseHeartRateMeasurement: jest.fn(() => null),
}));

jest.mock("react-native-ble-plx", () => ({
  __esModule: true,
  BleManager: class MockBleManager {
    onStateChange() {
      return () => undefined;
    }

    stopDeviceScan() {}

    startDeviceScan() {}
  },
  BleError: class MockBleError extends Error {},
  Characteristic: class MockCharacteristic {},
  Device: class MockDevice {},
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceGattQueueRegistry } from "./DeviceGattQueue";
import { FTMSController } from "./FTMSController";
import type { ConnectedSensor } from "./sensors";
import { SensorsManager } from "./sensors";

function createSensor(
  overrides: Partial<ConnectedSensor> & Pick<ConnectedSensor, "id" | "name" | "connectionState">,
): ConnectedSensor {
  return {
    services: [],
    characteristics: new Map(),
    device: {
      cancelConnection: jest.fn(async () => undefined),
    } as never,
    ...overrides,
  } as ConnectedSensor;
}

function setKnownSensors(
  manager: SensorsManager,
  sensors: Array<{
    id: string;
    name: string;
    lastConnected: number;
    autoConnectSuppressed?: boolean;
  }>,
) {
  (manager as any).knownSensorRegistry.sensors = new Map(
    sensors.map((sensor) => [sensor.id, sensor]),
  );
  (manager as any).knownSensorRegistry.autoReconnectSuppressedSensorIds = new Set(
    sensors.filter((sensor) => sensor.autoConnectSuppressed).map((sensor) => sensor.id),
  );
}

describe("SensorsManager QA regressions", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("reconnects both disconnected known sensors and persisted-only sensors", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);

    const disconnected = createSensor({
      id: "sensor-disconnected",
      name: "Disconnected Trainer",
      connectionState: "disconnected",
    });
    const alreadyConnected = createSensor({
      id: "sensor-connected",
      name: "Connected Trainer",
      connectionState: "connected",
    });

    (manager as any).connectedSensors = new Map([
      [disconnected.id, disconnected],
      [alreadyConnected.id, alreadyConnected],
    ]);
    setKnownSensors(manager, [
      { id: disconnected.id, name: disconnected.name, lastConnected: 1 },
      { id: alreadyConnected.id, name: alreadyConnected.name, lastConnected: 1 },
      { id: "sensor-persisted-only", name: "Saved Trainer", lastConnected: 1 },
    ]);

    const reconnectSpy = jest
      .spyOn(manager as any, "attemptReconnection")
      .mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await manager.reconnectAll();

    expect(reconnectSpy).toHaveBeenCalledWith("sensor-disconnected", 1);
    expect(connectSpy).toHaveBeenCalledWith("sensor-persisted-only");
    expect(reconnectSpy).not.toHaveBeenCalledWith("sensor-connected", 1);
    expect(connectSpy).not.toHaveBeenCalledWith("sensor-connected");

    (manager as any).stopConnectionMonitoring();
  });

  it("clears active trainer ownership when disconnecting a controllable trainer", async () => {
    const manager = new SensorsManager();
    const trainer = createSensor({
      id: "trainer-1",
      name: "Trainer 1",
      connectionState: "connected",
      isControllable: true,
      ftmsController: { reset: jest.fn() } as never,
    });

    (manager as any).connectedSensors = new Map([[trainer.id, trainer]]);
    (manager as any).controllableTrainer = trainer;
    (manager as any).trainerState = {
      deviceId: trainer.id,
      deviceName: trainer.name,
      connectionState: "connected",
      dataFlowState: "flowing",
      controlState: "controllable",
      lastServiceError: null,
    };

    await manager.disconnectSensor(trainer.id, { forgetPersisted: false });

    expect(manager.getControllableTrainer()).toBeUndefined();
    expect(trainer.isControllable).toBe(false);
    expect(trainer.ftmsController).toBeUndefined();
    expect(manager.getTrainerState()).toMatchObject({
      deviceId: trainer.id,
      connectionState: "disconnected",
      dataFlowState: "lost",
      controlState: "not_applicable",
    });

    (manager as any).stopConnectionMonitoring();
  });

  it("preserves known sensor memory on disconnect", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-known",
      name: "Known Strap",
      connectionState: "connected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.disconnectSensor(sensor.id);

    expect(manager.getPersistedSensors()).toEqual([
      expect.objectContaining({ id: sensor.id, name: sensor.name }),
    ]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith("@sensors:persisted_devices", "[]");

    (manager as any).stopConnectionMonitoring();
  });

  it("suppresses auto-reconnect after an intentional disconnect", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-manual-off",
      name: "Manual Off Strap",
      connectionState: "connected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.disconnectSensor(sensor.id);

    const reconnectSpy = jest
      .spyOn(manager as any, "attemptReconnection")
      .mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await manager.reconnectAll();

    expect(reconnectSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
    expect(manager.getPersistedSensors()).toEqual([
      expect.objectContaining({
        id: sensor.id,
        autoConnectSuppressed: true,
      }),
    ]);
    expect(AsyncStorage.setItem).toHaveBeenCalled();

    (manager as any).stopConnectionMonitoring();
  });

  it("allows auto-reconnect again after the user manually reconnects", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-reenabled",
      name: "Reenabled Strap",
      connectionState: "disconnected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [
      {
        id: sensor.id,
        name: sensor.name,
        lastConnected: 1,
        autoConnectSuppressed: true,
      },
    ]);

    await (manager as any).knownSensorRegistry.setAutoReconnectSuppressed(sensor.id, false);

    const reconnectSpy = jest
      .spyOn(manager as any, "attemptReconnection")
      .mockResolvedValue(undefined);

    await manager.reconnectAll();

    expect(reconnectSpy).toHaveBeenCalledWith(sensor.id, 1);

    (manager as any).stopConnectionMonitoring();
  });

  it("does not treat bulk disconnect as an intentional manual sensor disconnect", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-bulk-disconnect",
      name: "Bulk Disconnect Strap",
      connectionState: "connected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.disconnectAll();

    expect(manager.getPersistedSensors()).toEqual([
      expect.objectContaining({
        id: sensor.id,
        autoConnectSuppressed: false,
      }),
    ]);

    (manager as any).stopConnectionMonitoring();
  });

  it("schedules another reconnect attempt when connect returns null", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-retry-null",
      name: "Retry Strap",
      connectionState: "disconnected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await (manager as any).attemptReconnection(sensor.id, 1);

    expect((manager as any).reconnectionTimers.has(sensor.id)).toBe(true);

    (manager as any).cancelReconnectionAttempts(sensor.id);
    (manager as any).stopConnectionMonitoring();
  });

  it("does not reconnect persisted sensors while auto-reconnect is disabled", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-idle",
      name: "Idle Strap",
      connectionState: "disconnected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    const reconnectSpy = jest.spyOn(manager as any, "attemptReconnection");
    const connectSpy = jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await manager.reconnectAll();

    expect(reconnectSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();

    (manager as any).stopConnectionMonitoring();
  });

  it("cancels pending reconnect attempts when auto-reconnect is disabled", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-cancel-reconnect",
      name: "Cancel Reconnect Strap",
      connectionState: "disconnected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await (manager as any).attemptReconnection(sensor.id, 1);
    expect((manager as any).reconnectionTimers.has(sensor.id)).toBe(true);

    manager.setAutoReconnectEnabled(false);

    expect((manager as any).reconnectionTimers.has(sensor.id)).toBe(false);

    (manager as any).stopConnectionMonitoring();
  });

  it("resolves an active scan when scanning is stopped manually", async () => {
    const manager = new SensorsManager();

    const scanPromise = manager.startScan();
    manager.stopScan();

    await expect(scanPromise).resolves.toBeUndefined();

    (manager as any).stopConnectionMonitoring();
  });

  it("reset disconnects connected sensors and clears known sensors", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-reset",
      name: "Reset Strap",
      connectionState: "connected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.resetAllSensors();

    expect(manager.getConnectedSensors()).toEqual([]);
    expect(manager.getPersistedSensors()).toEqual([]);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("@sensors:persisted_devices");

    (manager as any).stopConnectionMonitoring();
  });

  it("removes known sensor memory only when forgotten", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-forgotten",
      name: "Forgotten Strap",
      connectionState: "connected",
    });

    (manager as any).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.forgetSensor(sensor.id);

    expect(manager.getPersistedSensors()).toEqual([]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("@sensors:persisted_devices", "[]");

    (manager as any).stopConnectionMonitoring();
  });

  it("serializes GATT operations per device without blocking other devices", async () => {
    const queues = new DeviceGattQueueRegistry();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = queues.enqueue("device-a", "first", async () => {
      events.push("a:first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push("a:first:end");
      return "first";
    });

    const second = queues.enqueue("device-a", "second", async () => {
      events.push("a:second");
      return "second";
    });

    const otherDevice = queues.enqueue("device-b", "other", async () => {
      events.push("b:other");
      return "other";
    });

    await Promise.resolve();
    expect(events).toEqual(["a:first:start", "b:other"]);

    releaseFirst?.();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    await expect(otherDevice).resolves.toBe("other");
    expect(events).toEqual(["a:first:start", "b:other", "a:first:end", "a:second"]);
  });

  it("publishes an FTMS candidate without requesting control on discovery", async () => {
    const manager = new SensorsManager();
    const requestControl = jest.fn(async () => ({ value: Buffer.alloc(8).toString("base64") }));
    const monitorStatus = jest.fn(() => ({ remove: jest.fn() }));
    const trainer = createSensor({
      id: "trainer-discovery",
      name: "Discovery Trainer",
      connectionState: "connected",
      device: {
        id: "trainer-discovery",
        readCharacteristicForService: requestControl,
        monitorCharacteristicForService: monitorStatus,
      } as never,
      characteristics: new Map([["ftms-indoor-bike-data", "fitness-machine"]]),
    });

    (manager as any).connectedSensors = new Map([[trainer.id, trainer]]);

    await (manager as any).setupFTMSRuntime(trainer);

    expect(requestControl).toHaveBeenCalledWith("fitness-machine", "ftms-feature");
    expect(requestControl).toHaveBeenCalledTimes(1);
    expect(manager.getFTMSCandidates().get(trainer.id)).toEqual(
      expect.objectContaining({
        deviceId: trainer.id,
        supportsControl: false,
        controlState: "not_applicable",
        machineType: "bike",
        machineTypeSource: "data_characteristic",
      }),
    );
    expect(manager.getFTMSController(trainer.id)).toBeDefined();

    (manager as any).stopConnectionMonitoring();
  });

  it("subscribes to all present FTMS registry streams and emits parsed readings", async () => {
    const manager = new SensorsManager();
    const monitorCallbacks = new Map<
      string,
      (error: Error | null, characteristic: { value: string } | null) => void
    >();
    const characteristics = [
      {
        uuid: "ftms-indoor-bike-data",
        monitor: jest.fn((callback) => {
          monitorCallbacks.set("ftms-indoor-bike-data", callback);
          return { remove: jest.fn() };
        }),
      },
      {
        uuid: "ftms-treadmill-data",
        monitor: jest.fn((callback) => {
          monitorCallbacks.set("ftms-treadmill-data", callback);
          return { remove: jest.fn() };
        }),
      },
      {
        uuid: "ftms-status",
        monitor: jest.fn((callback) => {
          monitorCallbacks.set("ftms-status", callback);
          return { remove: jest.fn() };
        }),
      },
    ];
    const service = {
      uuid: "fitness-machine",
      characteristics: jest.fn(async () => characteristics),
    };
    const trainer = createSensor({
      id: "trainer-streams",
      name: "Registry Trainer",
      connectionState: "connected",
      device: {
        id: "trainer-streams",
        services: jest.fn(async () => [service]),
      } as never,
      characteristics: new Map(characteristics.map((char) => [char.uuid, "fitness-machine"])),
    });
    const readings: unknown[] = [];

    (manager as any).connectedSensors = new Map([[trainer.id, trainer]]);
    manager.subscribe((reading) => readings.push(reading));

    await (manager as any).monitorFTMSStreams(trainer);

    expect(monitorCallbacks.has("ftms-indoor-bike-data")).toBe(true);
    expect(monitorCallbacks.has("ftms-treadmill-data")).toBe(true);
    expect(monitorCallbacks.has("ftms-status")).toBe(true);

    monitorCallbacks.get("ftms-indoor-bike-data")?.(null, {
      value: Buffer.from([0, 0]).toString("base64"),
    });

    expect(readings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "speed", value: 8.5 }),
        expect.objectContaining({ metric: "cadence", value: 91 }),
        expect.objectContaining({ metric: "power", value: 245 }),
        expect.objectContaining({ metric: "heartrate", value: 151 }),
      ]),
    );
    expect(trainer.observedMetrics).toEqual(new Set(["speed", "cadence", "power", "heartrate"]));

    (manager as any).stopConnectionMonitoring();
  });

  it("requests FTMS control on first command and does not reset between mode changes", async () => {
    let controlPointCallback:
      | ((error: Error | null, characteristic: { value: string } | null) => void)
      | undefined;
    const writtenOpcodes: number[] = [];
    const featuresPayload = Buffer.alloc(8);
    featuresPayload.writeUInt32LE((1 << 2) | (1 << 3), 4);

    const device = {
      id: "trainer-command-target",
      readCharacteristicForService: jest.fn(async (_service: string, characteristic: string) => ({
        value: characteristic === "ftms-feature" ? featuresPayload.toString("base64") : undefined,
      })),
      monitorCharacteristicForService: jest.fn((_service, _characteristic, callback) => {
        controlPointCallback = callback;
        return { remove: jest.fn() };
      }),
      writeCharacteristicWithResponseForService: jest.fn(
        async (_service, _characteristic, value) => {
          const opcode = Buffer.from(value, "base64")[0];
          writtenOpcodes.push(opcode);
          controlPointCallback?.(null, { value: Buffer.from([128, opcode, 1]).toString("base64") });
          return {};
        },
      ),
    } as never;

    const controller = new FTMSController(device, new DeviceGattQueueRegistry());
    await controller.readFeatures();

    await expect(controller.setResistanceTarget(20)).resolves.toBe(true);
    await expect(controller.setPowerTarget(220)).resolves.toBe(true);

    expect(writtenOpcodes).toEqual([0, 4, 5]);
    expect(writtenOpcodes).not.toContain(1);
  });
});
