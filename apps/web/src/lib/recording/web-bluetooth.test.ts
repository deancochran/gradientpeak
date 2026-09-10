import { describe, expect, it, vi } from "vitest";
import {
  decodeFitnessMachineFeature,
  decodeHeartRate,
  decodeIndoorBikeData,
  isWebBluetoothSupported,
  serializeFtmsRequestControl,
  serializeFtmsTargetPower,
  WebBluetoothRecorder,
  webBluetoothErrorMessage,
  webBluetoothServerSnapshot,
} from "./web-bluetooth";

class FakeCharacteristic extends EventTarget {
  value: DataView | null = null;
  properties: { indicate?: boolean; write?: boolean } = { indicate: true, write: true };
  readValue = vi.fn(async () => new DataView(Uint8Array.of(0, 0, 0, 0, 8, 0, 0, 0).buffer));
  writeValueWithResponse = vi.fn(async () => undefined);
  async startNotifications() {
    return this;
  }
  async stopNotifications() {
    return this;
  }
  emit(bytes: number[]) {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

describe("Web Bluetooth recorder", () => {
  it("detects browser support, keeps SSR unsupported, and serializes signed FTMS commands", () => {
    expect(isWebBluetoothSupported({})).toBe(false);
    expect(isWebBluetoothSupported({ bluetooth: { requestDevice: vi.fn() } })).toBe(true);
    expect(serializeFtmsRequestControl()).toEqual(Uint8Array.of(0));
    expect(webBluetoothServerSnapshot()).toMatchObject({ supported: false, status: "unavailable" });
    expect(serializeFtmsTargetPower(275)).toEqual(Uint8Array.of(5, 19, 1));
    expect(serializeFtmsTargetPower(-32_768)).toEqual(Uint8Array.of(5, 0, 128));
    expect(serializeFtmsTargetPower(32_767)).toEqual(Uint8Array.of(5, 255, 127));
    expect(() => serializeFtmsTargetPower(32_768)).toThrow(RangeError);
    expect(() => serializeFtmsTargetPower(1.5)).toThrow(RangeError);
  });

  it("decodes standard heart-rate and indoor-bike notifications", () => {
    expect(decodeHeartRate(new DataView(Uint8Array.of(0, 155).buffer))).toEqual({
      heartRateBpm: 155,
    });
    // Average speed/cadence, resistance, and average power precede the values we display.
    expect(
      decodeIndoorBikeData(
        new DataView(
          Uint8Array.of(
            0xfe,
            3,
            0xc4,
            9,
            0,
            0,
            180,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            250,
            0,
            0,
            0,
            44,
            1,
            0,
            0,
            0,
          ).buffer,
        ),
      ),
    ).toMatchObject({ speedKph: 25, cadenceRpm: 90, powerWatts: 250, calories: 300 });
  });

  it("enables target power only for FTMS trainers that advertise it and support control writes and indications", async () => {
    expect(
      decodeFitnessMachineFeature(new DataView(Uint8Array.of(0, 0, 0, 0, 8, 0, 0, 0).buffer)),
    ).toEqual({ targetPowerSupported: true });
    expect(decodeFitnessMachineFeature(new DataView(new ArrayBuffer(8)))).toEqual({
      targetPowerSupported: false,
    });

    const indoor = new FakeCharacteristic();
    const control = new FakeCharacteristic();
    control.properties = { write: true };
    const device = Object.assign(new EventTarget(), {
      gatt: {
        connected: true,
        connect: vi.fn(async () => ({
          getPrimaryService: async () => ({
            getCharacteristic: async (uuid: string) => (uuid.includes("2ad2") ? indoor : control),
          }),
        })),
        disconnect: vi.fn(),
      },
    });
    const recorder = new WebBluetoothRecorder({
      bluetooth: { requestDevice: vi.fn(async () => device) },
    });

    await recorder.connect();
    expect(recorder.getState()).toMatchObject({
      controlEligible: false,
      targetPowerSupported: false,
    });
    await expect(recorder.setTargetPower(200)).resolves.toBe(false);
    expect(control.writeValueWithResponse).not.toHaveBeenCalled();
  });

  it("captures only session counter deltas and treats a counter reset as a new baseline", async () => {
    const indoor = new FakeCharacteristic();
    const device = Object.assign(new EventTarget(), {
      gatt: {
        connected: true,
        connect: vi.fn(async () => ({
          getPrimaryService: async (uuid: string) => ({
            getCharacteristic: async (uuid: string) =>
              uuid.includes("2ad2") ? indoor : new FakeCharacteristic(),
          }),
        })),
        disconnect: vi.fn(),
      },
    });
    const recorder = new WebBluetoothRecorder({
      bluetooth: { requestDevice: vi.fn(async () => device) },
    });
    await recorder.connect();
    recorder.beginSessionMetrics();

    indoor.emit([0x11, 1, 0xe8, 3, 0, 100, 0, 0, 0, 0]);
    indoor.emit([0x11, 1, 0x4c, 4, 0, 120, 0, 0, 0, 0]);
    indoor.emit([0x11, 1, 0x7e, 4, 0, 140, 0, 0, 0, 0]);
    indoor.emit([0x11, 1, 10, 0, 0, 2, 0, 0, 0, 0]);

    expect(recorder.getSessionMetricDeltas()).toEqual({ distanceMeters: 160, calories: 42 });
  });

  it("uses the explicit compatible-device chooser, validates GATT services, streams metrics, and controls an eligible trainer", async () => {
    const indoor = new FakeCharacteristic();
    const control = new FakeCharacteristic();
    const disconnected = new EventTarget();
    const gatt = {
      connected: true,
      connect: vi.fn(async () => ({
        getPrimaryService: async (uuid: string) => {
          if (uuid.endsWith("1826-0000-1000-8000-00805f9b34fb"))
            return {
              getCharacteristic: async (id: string) =>
                id.endsWith("2ad2-0000-1000-8000-00805f9b34fb") ? indoor : control,
            };
          throw new Error("not available");
        },
      })),
      disconnect: vi.fn(),
    };
    const device = Object.assign(disconnected, { name: "Trainer", gatt });
    const requestDevice = vi.fn(async () => device);
    const recorder = new WebBluetoothRecorder({ bluetooth: { requestDevice } });

    await recorder.connect();
    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(requestDevice).toHaveBeenCalledWith({
      acceptAllDevices: true,
      optionalServices: expect.arrayContaining([
        "00001826-0000-1000-8000-00805f9b34fb",
        "0000180d-0000-1000-8000-00805f9b34fb",
        "00001818-0000-1000-8000-00805f9b34fb",
      ]),
    });
    expect(recorder.getState()).toMatchObject({
      status: "connected",
      deviceName: "Trainer",
      controlEligible: true,
    });
    indoor.emit([0x44, 0, 0xc4, 9, 180, 0, 250, 0]);
    expect(recorder.getState().metrics).toMatchObject({
      speedKph: 25,
      cadenceRpm: 90,
      powerWatts: 250,
    });
    const controlRequest = recorder.requestControl();
    await vi.waitFor(() =>
      expect(control.writeValueWithResponse).toHaveBeenCalledWith(Uint8Array.of(0)),
    );
    await Promise.resolve();
    control.emit([0x80, 0, 1]);
    await expect(controlRequest).resolves.toBe(true);
    const targetPower = recorder.setTargetPower(200);
    await vi.waitFor(() =>
      expect(control.writeValueWithResponse).toHaveBeenNthCalledWith(2, Uint8Array.of(5, 200, 0)),
    );
    control.emit([0x80, 5, 1]);
    await expect(targetPower).resolves.toBe(true);
    expect(control.writeValueWithResponse).toHaveBeenNthCalledWith(1, Uint8Array.of(0));
    expect(control.writeValueWithResponse).toHaveBeenNthCalledWith(2, Uint8Array.of(5, 200, 0));
    recorder.disconnect();
    expect(gatt.disconnect).toHaveBeenCalledTimes(1);
    expect(recorder.getState().status).toBe("disconnected");
  });

  it("rejects an accept-all chooser selection that exposes none of the supported GATT services", async () => {
    const requestDevice = vi.fn(async () =>
      Object.assign(new EventTarget(), {
        gatt: {
          connected: true,
          connect: vi.fn(async () => ({
            getPrimaryService: async () => {
              throw new Error("service unavailable");
            },
          })),
          disconnect: vi.fn(),
        },
      }),
    );
    const recorder = new WebBluetoothRecorder({ bluetooth: { requestDevice } });

    await recorder.connect();

    expect(requestDevice).toHaveBeenCalledWith(expect.objectContaining({ acceptAllDevices: true }));
    expect(recorder.getState()).toMatchObject({
      status: "error",
      error:
        "The selected device does not provide supported FTMS, heart-rate, or cycling-power data.",
    });
  });

  it("ignores mismatched responses, reports rejected commands, and cleans up an unexpected disconnect", async () => {
    const indoor = new FakeCharacteristic();
    const control = new FakeCharacteristic();
    const deviceEvents = new EventTarget();
    const gatt = {
      connected: true,
      connect: vi.fn(async () => ({
        getPrimaryService: async (uuid: string) => {
          if (!uuid.endsWith("1826-0000-1000-8000-00805f9b34fb")) throw new Error("not available");
          return {
            getCharacteristic: async (id: string) => (id.includes("2ad2") ? indoor : control),
          };
        },
      })),
      disconnect: vi.fn(),
    };
    const device = Object.assign(deviceEvents, { name: "Trainer", gatt });
    const recorder = new WebBluetoothRecorder({
      bluetooth: { requestDevice: vi.fn(async () => device) },
    });
    await recorder.connect();
    const request = recorder.requestControl();
    await vi.waitFor(() => expect(control.writeValueWithResponse).toHaveBeenCalled());
    control.emit([0x80, 5, 1]);
    control.emit([0x80, 0, 4]);
    await expect(request).resolves.toBe(false);
    expect(recorder.getState()).toMatchObject({
      controlGranted: false,
      error: "Trainer did not grant control.",
    });
    deviceEvents.dispatchEvent(new Event("gattserverdisconnected"));
    expect(recorder.getState()).toMatchObject({
      status: "disconnected",
      deviceName: null,
      controlEligible: false,
    });
    expect(gatt.disconnect).not.toHaveBeenCalled();
    indoor.emit([0x44, 0, 0xc4, 9, 180, 0, 250, 0]);
    expect(recorder.getState().metrics.powerWatts).toBeNull();
  });

  it("cancels a connection that resolves after the recorder disconnects", async () => {
    let resolveDevice!: (device: unknown) => void;
    const requestDevice = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveDevice = resolve;
        }),
    );
    const gatt = { connected: false, connect: vi.fn(), disconnect: vi.fn() };
    const device = Object.assign(new EventTarget(), { gatt });
    const recorder = new WebBluetoothRecorder({
      bluetooth: { requestDevice: requestDevice as never },
    });
    const connecting = recorder.connect();
    recorder.disconnect();
    resolveDevice(device);
    await connecting;
    expect(gatt.connect).not.toHaveBeenCalled();
    expect(recorder.getState().status).toBe("disconnected");
  });

  it("maps browser, permission, chooser, and hardware errors to actionable guidance", async () => {
    expect(webBluetoothErrorMessage({ name: "SecurityError" })).toMatch(/Permissions Policy/);
    expect(webBluetoothErrorMessage({ name: "NotFoundError" })).toMatch(/Turn on a compatible/);
    expect(webBluetoothErrorMessage({ name: "NetworkError" })).toMatch(/Move it closer/);

    vi.stubGlobal("isSecureContext", false);
    const recorder = new WebBluetoothRecorder({ bluetooth: { requestDevice: vi.fn() } });
    await recorder.connect();
    expect(recorder.getState().error).toMatch(/secure \(HTTPS\) page/);
    vi.unstubAllGlobals();
  });
});
