jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
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
  FTMS_CHARACTERISTICS: {},
  parseCscMeasurement: jest.fn(() => null),
  parseCyclingPowerMeasurement: jest.fn(() => null),
  parseFtmsIndoorBikeData: jest.fn(() => null),
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

describe("SensorsManager QA regressions", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reconnects both disconnected known sensors and persisted-only sensors", async () => {
    const manager = new SensorsManager();

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
    (manager as any).persistedSensors = new Map([
      [disconnected.id, { id: disconnected.id, name: disconnected.name, lastConnected: 1 }],
      [alreadyConnected.id, { id: alreadyConnected.id, name: alreadyConnected.name, lastConnected: 1 }],
      ["sensor-persisted-only", { id: "sensor-persisted-only", name: "Saved Trainer", lastConnected: 1 }],
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
});
