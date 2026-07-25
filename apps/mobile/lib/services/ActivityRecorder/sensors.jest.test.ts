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
  BLE_CHARACTERISTIC_UUIDS: {
    HEART_RATE_MEASUREMENT: "00002a37-0000-1000-8000-00805f9b34fb",
    CYCLING_POWER_MEASUREMENT: "00002a63-0000-1000-8000-00805f9b34fb",
    CYCLING_SPEED_AND_CADENCE_MEASUREMENT: "00002a5b-0000-1000-8000-00805f9b34fb",
    RUNNING_SPEED_AND_CADENCE_MEASUREMENT: "00002a53-0000-1000-8000-00805f9b34fb",
    BATTERY_LEVEL: "00002a19-0000-1000-8000-00805f9b34fb",
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
        status: { code: 0xff, label: "control_permission_lost" },
        diagnostics: { truncated: false, bytesRead: 1, byteLength: 1 },
      })),
    },
  ]),
  listStandardBleProfileDefinitions: jest.fn(() => []),
  matchStandardBleProfiles: jest.fn(() => []),
  parseCscMeasurement: jest.fn(() => null),
  parseCyclingPowerMeasurement: jest.fn(() => null),
  parseCyclingPowerMeasurementWithState: jest.fn(() => ({
    powerWatts: null,
    cadenceRpm: null,
    speedMps: null,
    hrBpm: null,
    nextState: {},
    truncated: false,
  })),
  parseHeartRateMeasurement: jest.fn(() => null),
  parseRunningSpeedAndCadenceMeasurement: jest.fn(() => ({
    powerWatts: null,
    cadenceRpm: null,
    speedMps: null,
    hrBpm: null,
  })),
}));

jest.mock("@deancochran/ftms", () => {
  const actual = jest.requireActual<typeof import("@deancochran/ftms")>("@deancochran/ftms");
  const core = jest.requireMock("@repo/core") as {
    BLE_SERVICE_UUIDS: { FITNESS_MACHINE: string };
    FTMS_CHARACTERISTICS: typeof actual.FTMS_CHARACTERISTICS;
    detectFtmsMachineType: typeof actual.detectFtmsMachineType;
    listFtmsParserDefinitions: typeof actual.listFtmsParserDefinitions;
  };

  return {
    ...actual,
    FTMS_SERVICE_UUIDS: { FITNESS_MACHINE: core.BLE_SERVICE_UUIDS.FITNESS_MACHINE },
    FTMS_CHARACTERISTICS: core.FTMS_CHARACTERISTICS,
    detectFtmsMachineType: core.detectFtmsMachineType,
    listFtmsParserDefinitions: core.listFtmsParserDefinitions,
  };
});

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

interface KnownSensorFixture {
  id: string;
  name: string;
  lastConnected: number;
  autoConnectSuppressed?: boolean;
}

interface SensorsManagerInternals {
  knownSensorRegistry: {
    sensors: Map<string, KnownSensorFixture>;
    autoReconnectSuppressedSensorIds: Set<string>;
    setAutoReconnectSuppressed(sensorId: string, suppressed: boolean): Promise<void>;
  };
  connectedSensors: Map<string, ConnectedSensor>;
  gattQueues: DeviceGattQueueRegistry;
  controllableTrainer: ConnectedSensor | undefined;
  trainerState: unknown;
  reconnectionTimers: Map<string, unknown>;
  ftmsCandidates: Map<string, { controlState: string }>;
  attemptReconnection(sensorId: string, attempt: number): Promise<void>;
  cancelReconnectionAttempts(sensorId: string): void;
  stopConnectionMonitoring(): void;
  setupFTMSRuntime(sensor: ConnectedSensor): Promise<void>;
  monitorKnownCharacteristics(sensor: ConnectedSensor): Promise<void>;
  monitorFTMSStreams(sensor: ConnectedSensor): Promise<void>;
}

function getManagerInternals(manager: SensorsManager): SensorsManagerInternals {
  return manager as unknown as SensorsManagerInternals;
}

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

function setKnownSensors(manager: SensorsManager, sensors: KnownSensorFixture[]) {
  getManagerInternals(manager).knownSensorRegistry.sensors = new Map(
    sensors.map((sensor) => [sensor.id, sensor]),
  );
  getManagerInternals(manager).knownSensorRegistry.autoReconnectSuppressedSensorIds = new Set(
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

    getManagerInternals(manager).connectedSensors = new Map([
      [disconnected.id, disconnected],
      [alreadyConnected.id, alreadyConnected],
    ]);
    setKnownSensors(manager, [
      { id: disconnected.id, name: disconnected.name, lastConnected: 1 },
      { id: alreadyConnected.id, name: alreadyConnected.name, lastConnected: 1 },
      { id: "sensor-persisted-only", name: "Saved Trainer", lastConnected: 1 },
    ]);

    const reconnectSpy = jest
      .spyOn(getManagerInternals(manager), "attemptReconnection")
      .mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await manager.reconnectAll();

    expect(reconnectSpy).toHaveBeenCalledWith("sensor-disconnected", 1);
    expect(connectSpy).toHaveBeenCalledWith("sensor-persisted-only");
    expect(reconnectSpy).not.toHaveBeenCalledWith("sensor-connected", 1);
    expect(connectSpy).not.toHaveBeenCalledWith("sensor-connected");

    getManagerInternals(manager).stopConnectionMonitoring();
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

    getManagerInternals(manager).connectedSensors = new Map([[trainer.id, trainer]]);
    getManagerInternals(manager).controllableTrainer = trainer;
    getManagerInternals(manager).trainerState = {
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

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("preserves known sensor memory on disconnect", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-known",
      name: "Known Strap",
      connectionState: "connected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.disconnectSensor(sensor.id);

    expect(manager.getPersistedSensors()).toEqual([
      expect.objectContaining({ id: sensor.id, name: sensor.name }),
    ]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith("@sensors:persisted_devices", "[]");

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("suppresses auto-reconnect after an intentional disconnect", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-manual-off",
      name: "Manual Off Strap",
      connectionState: "connected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.disconnectSensor(sensor.id);

    const reconnectSpy = jest
      .spyOn(getManagerInternals(manager), "attemptReconnection")
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

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("allows auto-reconnect again after the user manually reconnects", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-reenabled",
      name: "Reenabled Strap",
      connectionState: "disconnected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [
      {
        id: sensor.id,
        name: sensor.name,
        lastConnected: 1,
        autoConnectSuppressed: true,
      },
    ]);

    await getManagerInternals(manager).knownSensorRegistry.setAutoReconnectSuppressed(
      sensor.id,
      false,
    );

    const reconnectSpy = jest
      .spyOn(getManagerInternals(manager), "attemptReconnection")
      .mockResolvedValue(undefined);

    await manager.reconnectAll();

    expect(reconnectSpy).toHaveBeenCalledWith(sensor.id, 1);

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("does not treat bulk disconnect as an intentional manual sensor disconnect", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-bulk-disconnect",
      name: "Bulk Disconnect Strap",
      connectionState: "connected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.disconnectAll();

    expect(manager.getPersistedSensors()).toEqual([
      expect.objectContaining({
        id: sensor.id,
        autoConnectSuppressed: false,
      }),
    ]);

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("schedules another reconnect attempt when connect returns null", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-retry-null",
      name: "Retry Strap",
      connectionState: "disconnected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await getManagerInternals(manager).attemptReconnection(sensor.id, 1);

    expect(getManagerInternals(manager).reconnectionTimers.has(sensor.id)).toBe(true);

    getManagerInternals(manager).cancelReconnectionAttempts(sensor.id);
    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("does not reconnect persisted sensors while auto-reconnect is disabled", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-idle",
      name: "Idle Strap",
      connectionState: "disconnected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    const reconnectSpy = jest.spyOn(getManagerInternals(manager), "attemptReconnection");
    const connectSpy = jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await manager.reconnectAll();

    expect(reconnectSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("cancels pending reconnect attempts when auto-reconnect is disabled", async () => {
    const manager = new SensorsManager();
    manager.setAutoReconnectEnabled(true);
    const sensor = createSensor({
      id: "sensor-cancel-reconnect",
      name: "Cancel Reconnect Strap",
      connectionState: "disconnected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    jest.spyOn(manager, "connectSensor").mockResolvedValue(null);

    await getManagerInternals(manager).attemptReconnection(sensor.id, 1);
    expect(getManagerInternals(manager).reconnectionTimers.has(sensor.id)).toBe(true);

    manager.setAutoReconnectEnabled(false);

    expect(getManagerInternals(manager).reconnectionTimers.has(sensor.id)).toBe(false);

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("resolves an active scan when scanning is stopped manually", async () => {
    const manager = new SensorsManager();

    const scanPromise = manager.startScan();
    manager.stopScan();

    await expect(scanPromise).resolves.toBeUndefined();

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("reset disconnects connected sensors and clears known sensors", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-reset",
      name: "Reset Strap",
      connectionState: "connected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.resetAllSensors();

    expect(manager.getConnectedSensors()).toEqual([]);
    expect(manager.getPersistedSensors()).toEqual([]);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("@sensors:persisted_devices");

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("removes known sensor memory only when forgotten", async () => {
    const manager = new SensorsManager();
    const sensor = createSensor({
      id: "sensor-forgotten",
      name: "Forgotten Strap",
      connectionState: "connected",
    });

    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    setKnownSensors(manager, [{ id: sensor.id, name: sensor.name, lastConnected: 1 }]);

    await manager.forgetSensor(sensor.id);

    expect(manager.getPersistedSensors()).toEqual([]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("@sensors:persisted_devices", "[]");

    getManagerInternals(manager).stopConnectionMonitoring();
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

  it("interrupts a hung GATT operation for disconnect without releasing its reconnect fence", async () => {
    const manager = new SensorsManager();
    const internals = getManagerInternals(manager);
    let releaseHungOperation: (() => void) | undefined;
    const hungOperation = new Promise<void>((resolve) => {
      releaseHungOperation = resolve;
    });
    const cancelConnection = jest.fn(async () => undefined);
    const sensor = createSensor({
      id: "sensor-hung-disconnect",
      name: "Hung Disconnect Strap",
      connectionState: "connected",
      device: { cancelConnection } as never,
    });
    internals.connectedSensors = new Map([[sensor.id, sensor]]);

    const active = internals.gattQueues.enqueue(sensor.id, "hung-read", () => hungOperation);
    await Promise.resolve();

    await expect(manager.disconnectSensor(sensor.id)).resolves.toBeUndefined();
    await expect(active).rejects.toThrow("Sensor disconnecting");
    expect(cancelConnection).toHaveBeenCalledTimes(1);

    let replacementStarted = false;
    const replacement = internals.gattQueues.enqueue(sensor.id, "replacement", async () => {
      replacementStarted = true;
    });
    await Promise.resolve();
    expect(replacementStarted).toBe(false);

    releaseHungOperation?.();
    await expect(replacement).resolves.toBeUndefined();
    expect(replacementStarted).toBe(true);
    internals.stopConnectionMonitoring();
  });

  it("coalesces concurrent disconnect requests for the same sensor", async () => {
    const manager = new SensorsManager();
    let releaseDisconnect: (() => void) | undefined;
    const nativeDisconnect = new Promise<void>((resolve) => {
      releaseDisconnect = resolve;
    });
    const cancelConnection = jest.fn(() => nativeDisconnect);
    const sensor = createSensor({
      id: "sensor-concurrent-disconnect",
      name: "Concurrent Disconnect Strap",
      connectionState: "connected",
      device: { cancelConnection } as never,
    });
    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);

    const first = manager.disconnectSensor(sensor.id);
    const second = manager.disconnectSensor(sensor.id);
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelConnection).toHaveBeenCalledTimes(1);

    releaseDisconnect?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(manager.getConnectedSensors()).toEqual([]);
    getManagerInternals(manager).stopConnectionMonitoring();
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

    getManagerInternals(manager).connectedSensors = new Map([[trainer.id, trainer]]);

    await getManagerInternals(manager).setupFTMSRuntime(trainer);

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

    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("keeps a feature-eligible FTMS candidate distinct from granted control", async () => {
    const manager = new SensorsManager();
    const featuresPayload = Buffer.alloc(8);
    featuresPayload.writeUInt32LE(1 << 3, 4);
    const trainer = createSensor({
      id: "trainer-eligible",
      name: "Eligible Trainer",
      connectionState: "connected",
      device: {
        id: "trainer-eligible",
        readCharacteristicForService: jest.fn(async (_service: string, characteristic: string) => ({
          value:
            characteristic === "ftms-feature"
              ? featuresPayload.toString("base64")
              : Buffer.from([100, 0, 0x90, 1, 5, 0]).toString("base64"),
        })),
      } as never,
      characteristics: new Map([["ftms-indoor-bike-data", "fitness-machine"]]),
    });
    getManagerInternals(manager).connectedSensors = new Map([[trainer.id, trainer]]);

    await getManagerInternals(manager).setupFTMSRuntime(trainer);

    expect(manager.getSelectedFTMSTrainer()).toBe(trainer);
    expect(manager.getControllableTrainer()).toBeUndefined();
    expect(manager.getFTMSCandidates().get(trainer.id)).toMatchObject({
      controlState: "eligible",
      supportsControl: true,
    });
    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("tracks a matched standard profile from waiting to flowing", async () => {
    const core = jest.requireMock("@repo/core") as {
      listStandardBleProfileDefinitions: jest.Mock;
      parseCyclingPowerMeasurementWithState: jest.Mock;
    };
    const profile = {
      id: "cycling_power",
      name: "Cycling Power",
      serviceUuid: "cycling-power",
      measurementCharacteristicUuid: "00002a63-0000-1000-8000-00805f9b34fb",
      metrics: [
        { metric: "power", requirement: "required" },
        { metric: "cadence", requirement: "optional" },
      ],
    } as const;
    core.listStandardBleProfileDefinitions.mockReturnValue([profile]);
    core.parseCyclingPowerMeasurementWithState.mockReturnValue({
      powerWatts: 247,
      cadenceRpm: 89,
      speedMps: null,
      hrBpm: null,
      nextState: { lastCrankRevolutions: 2, lastCrankEventTime1024: 1024 },
      truncated: false,
    });

    let monitorCallback:
      | ((error: Error | null, characteristic: { value: string } | null) => void)
      | undefined;
    const characteristic = {
      uuid: profile.measurementCharacteristicUuid,
      isNotifiable: true,
      isIndicatable: false,
      monitor: jest.fn((callback) => {
        monitorCallback = callback;
        return { remove: jest.fn() };
      }),
    };
    const service = {
      uuid: profile.serviceUuid,
      characteristics: jest.fn(async () => [characteristic]),
    };
    const sensor = createSensor({
      id: "stages-console",
      name: "Stages IC 000",
      connectionState: "connected",
      services: [profile.serviceUuid],
      profiles: [
        {
          id: profile.id,
          name: profile.name,
          metrics: profile.metrics,
          streamState: "subscribing",
        },
      ],
      device: {
        id: "stages-console",
        services: jest.fn(async () => [service]),
      } as never,
      characteristics: new Map([[profile.measurementCharacteristicUuid, profile.serviceUuid]]),
    });
    const readings: unknown[] = [];
    const manager = new SensorsManager();
    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    manager.subscribe((reading) => readings.push(reading));

    await getManagerInternals(manager).monitorKnownCharacteristics(sensor);
    expect(sensor.profiles?.[0]?.streamState).toBe("waiting_for_data");

    monitorCallback?.(null, { value: Buffer.from([0, 0, 0, 0]).toString("base64") });

    expect(sensor.profiles?.[0]?.streamState).toBe("flowing");
    expect(sensor.profiles?.[0]?.metricLastDataTimestamps).toEqual({
      power: expect.any(Number),
      cadence: expect.any(Number),
    });
    expect(sensor.observedMetrics).toEqual(new Set(["power", "cadence"]));
    expect(readings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "power", value: 247 }),
        expect.objectContaining({ metric: "cadence", value: 89 }),
      ]),
    );

    core.listStandardBleProfileDefinitions.mockReturnValue([]);
    getManagerInternals(manager).stopConnectionMonitoring();
  });

  it("retires a failed monitor before retrying with a unique transaction", async () => {
    const core = jest.requireMock("@repo/core") as {
      listStandardBleProfileDefinitions: jest.Mock;
      parseHeartRateMeasurement: jest.Mock;
    };
    const profile = {
      id: "heart_rate",
      name: "Heart Rate",
      serviceUuid: "heart-rate",
      measurementCharacteristicUuid: "00002a37-0000-1000-8000-00805f9b34fb",
      metrics: [{ metric: "heart_rate", requirement: "required" }],
    } as const;
    core.listStandardBleProfileDefinitions.mockReturnValue([profile]);
    core.parseHeartRateMeasurement.mockReturnValue({ hrBpm: 120 });

    const callbacks: Array<(error: Error | null, value: { value: string } | null) => void> = [];
    const removers = [jest.fn(), jest.fn()];
    const transactionIds: string[] = [];
    const characteristic = {
      uuid: profile.measurementCharacteristicUuid,
      isNotifiable: true,
      isIndicatable: false,
      monitor: jest.fn((callback, transactionId) => {
        callbacks.push(callback);
        transactionIds.push(transactionId);
        return { remove: removers[transactionIds.length - 1] };
      }),
    };
    const service = {
      uuid: profile.serviceUuid,
      characteristics: jest.fn(async () => [characteristic]),
    };
    const sensor = createSensor({
      id: "retrying-strap",
      name: "Retrying Strap",
      connectionState: "connected",
      profiles: [
        {
          id: profile.id,
          name: profile.name,
          metrics: profile.metrics,
          streamState: "subscribing",
        },
      ],
      device: { services: jest.fn(async () => [service]) } as never,
    });
    const manager = new SensorsManager();
    const readings: unknown[] = [];
    getManagerInternals(manager).connectedSensors = new Map([[sensor.id, sensor]]);
    manager.subscribe((reading) => readings.push(reading));

    await getManagerInternals(manager).monitorKnownCharacteristics(sensor);
    callbacks[0]?.(new Error("notify failed"), null);
    await new Promise((resolve) => setImmediate(resolve));

    expect(removers[0]).toHaveBeenCalledTimes(1);
    expect(transactionIds).toEqual([
      "sensor:retrying-strap:profile:heart_rate:0",
      "sensor:retrying-strap:profile:heart_rate:1",
    ]);
    expect(sensor.profiles?.[0]?.streamState).toBe("waiting_for_data");

    sensor.connectionState = "disconnected";
    callbacks[1]?.(null, { value: Buffer.from([0, 120]).toString("base64") });
    expect(readings).toEqual([]);
    expect(sensor.connectionState).toBe("disconnected");

    core.listStandardBleProfileDefinitions.mockReturnValue([]);
    core.parseHeartRateMeasurement.mockReturnValue(null);
    getManagerInternals(manager).stopConnectionMonitoring();
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
    const handleMachineStatus = jest.fn(() => true);
    trainer.ftmsController = { handleMachineStatus } as never;

    getManagerInternals(manager).connectedSensors = new Map([[trainer.id, trainer]]);
    getManagerInternals(manager).ftmsCandidates = new Map([
      [trainer.id, { controlState: "controllable" }],
    ]);
    getManagerInternals(manager).trainerState = {
      deviceId: trainer.id,
      deviceName: trainer.name,
      connectionState: "connected",
      dataFlowState: "flowing",
      controlState: "controllable",
      lastServiceError: null,
    };
    manager.subscribe((reading) => readings.push(reading));
    const connectionChanges: ConnectedSensor[] = [];
    manager.subscribeConnection((sensor) => connectionChanges.push(sensor));

    await getManagerInternals(manager).monitorFTMSStreams(trainer);

    expect(monitorCallbacks.has("ftms-indoor-bike-data")).toBe(true);
    expect(monitorCallbacks.has("ftms-treadmill-data")).toBe(true);
    expect(monitorCallbacks.has("ftms-status")).toBe(true);

    monitorCallbacks.get("ftms-status")?.(null, {
      value: Buffer.from([0xff]).toString("base64"),
    });
    expect(handleMachineStatus).toHaveBeenCalledWith(0xff);
    expect(trainer.currentControlMode).toBeUndefined();
    expect(getManagerInternals(manager).ftmsCandidates.get(trainer.id)?.controlState).toBe(
      "control_lost",
    );
    expect(manager.getTrainerState().controlState).toBe("control_lost");
    expect(connectionChanges).toEqual([trainer]);

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
    expect(trainer.ftmsStreamState).toBe("flowing");
    expect(trainer.ftmsMetricLastDataTimestamps).toEqual({
      speed: expect.any(Number),
      cadence: expect.any(Number),
      power: expect.any(Number),
      heartrate: expect.any(Number),
    });

    getManagerInternals(manager).stopConnectionMonitoring();
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
