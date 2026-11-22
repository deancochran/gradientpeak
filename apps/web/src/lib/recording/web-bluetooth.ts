import {
  parseCyclingPowerMeasurementWithState,
  parseHeartRateMeasurement,
} from "@repo/core/bluetooth";
import {
  MEASURED_SOURCE_FRESHNESS_MS,
  type MeasuredMetricSample,
  type MeasuredNotification,
  measuredMetricSampleSchema,
  measuredNotificationSchema,
} from "@repo/core/recording/measured-journal";

export type WebBluetoothMetrics = {
  heartRateBpm: number | null;
  cadenceRpm: number | null;
  powerWatts: number | null;
  speedKph: number | null;
  distanceMeters: number | null;
  calories: number | null;
};
export type WebBluetoothSessionMetricDeltas = Pick<
  WebBluetoothMetrics,
  "distanceMeters" | "calories"
>;
export type WebBluetoothState = {
  supported: boolean;
  status: "unavailable" | "idle" | "connecting" | "connected" | "disconnected" | "error";
  deviceName: string | null;
  controlEligible: boolean;
  controlGranted: boolean;
  targetPowerSupported: boolean;
  error: string | null;
  metrics: WebBluetoothMetrics;
};
type BluetoothCharacteristic = {
  value?: DataView | null;
  properties?: { indicate?: boolean; write?: boolean };
  readValue?(): Promise<DataView>;
  startNotifications(): Promise<BluetoothCharacteristic>;
  stopNotifications?(): Promise<BluetoothCharacteristic>;
  writeValueWithResponse?(value: Uint8Array): Promise<void>;
  addEventListener(type: "characteristicvaluechanged", listener: EventListener): void;
  removeEventListener(type: "characteristicvaluechanged", listener: EventListener): void;
};
type BluetoothService = { getCharacteristic(uuid: string): Promise<BluetoothCharacteristic> };
type BluetoothDevice = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<BluetoothService> }>;
    disconnect(): void;
  };
  addEventListener(type: "gattserverdisconnected", listener: EventListener): void;
  removeEventListener(type: "gattserverdisconnected", listener: EventListener): void;
};
type BluetoothNavigator = {
  bluetooth?: {
    requestDevice(options: {
      acceptAllDevices: true;
      optionalServices: string[];
    }): Promise<BluetoothDevice>;
  };
};

const services = {
  ftms: "00001826-0000-1000-8000-00805f9b34fb",
  heartRate: "0000180d-0000-1000-8000-00805f9b34fb",
  cyclingPower: "00001818-0000-1000-8000-00805f9b34fb",
};
const characteristics = {
  indoorBike: "00002ad2-0000-1000-8000-00805f9b34fb",
  controlPoint: "00002ad9-0000-1000-8000-00805f9b34fb",
  fitnessMachineFeature: "00002acc-0000-1000-8000-00805f9b34fb",
  heartRate: "00002a37-0000-1000-8000-00805f9b34fb",
  cyclingPower: "00002a63-0000-1000-8000-00805f9b34fb",
};
const emptyMetrics = (): WebBluetoothMetrics => ({
  heartRateBpm: null,
  cadenceRpm: null,
  powerWatts: null,
  speedKph: null,
  distanceMeters: null,
  calories: null,
});
const serverSnapshot: WebBluetoothState = {
  supported: false,
  status: "unavailable",
  deviceName: null,
  controlEligible: false,
  controlGranted: false,
  targetPowerSupported: false,
  error: null,
  metrics: emptyMetrics(),
};
export const webBluetoothServerSnapshot = (): WebBluetoothState => serverSnapshot;

export function isWebBluetoothSupported(navigatorLike: unknown = globalThis.navigator): boolean {
  return Boolean((navigatorLike as BluetoothNavigator | undefined)?.bluetooth?.requestDevice);
}
export function serializeFtmsRequestControl(): Uint8Array {
  return Uint8Array.of(0x00);
}
/** FTMS Set Target Power uses a signed 16-bit integer in watts. */
export function serializeFtmsTargetPower(watts: number): Uint8Array {
  if (!Number.isInteger(watts) || watts < -32_768 || watts > 32_767)
    throw new RangeError("FTMS target power must be an integer from -32768 to 32767 watts.");
  const view = new DataView(new ArrayBuffer(3));
  view.setUint8(0, 0x05);
  view.setInt16(1, watts, true);
  return new Uint8Array(view.buffer);
}
/** FTMS Fitness Machine Feature: Target Setting Features bit 3 is Target Power Setting Supported. */
export function decodeFitnessMachineFeature(value: DataView): { targetPowerSupported: boolean } {
  return {
    targetPowerSupported: value.byteLength >= 8 && Boolean(value.getUint32(4, true) & (1 << 3)),
  };
}
export function webBluetoothErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "SecurityError") {
    return "Bluetooth access is blocked by browser security or this page's Permissions Policy. Open this recorder over HTTPS and allow Bluetooth for this site.";
  }
  if (name === "NotFoundError") {
    return "No compatible Bluetooth device was selected. Turn on a compatible trainer or sensor and try again.";
  }
  if (name === "NetworkError") {
    return "The Bluetooth device disconnected or is out of range. Move it closer, wake it, then connect it again.";
  }
  return error instanceof Error ? error.message : "Bluetooth connection failed.";
}
export function decodeHeartRate(value: DataView): Pick<WebBluetoothMetrics, "heartRateBpm"> {
  return {
    heartRateBpm: parseHeartRateMeasurement(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    ).hrBpm,
  };
}
export function decodeIndoorBikeData(value: DataView): Partial<WebBluetoothMetrics> {
  // Keep this bounds-checked projection until @deancochran/ftms fixes its
  // one-byte Indoor Bike resistance field. The field occupies two bytes.
  let offset = 2;
  const take = (count: number) => {
    if (offset + count > value.byteLength) throw new RangeError("Truncated FTMS notification");
    const from = offset;
    offset += count;
    return from;
  };
  try {
    const flags = value.getUint16(0, true);
    const metrics: Partial<WebBluetoothMetrics> = {};
    if (!(flags & 1)) {
      const raw = value.getUint16(take(2), true);
      if (raw !== 65535) metrics.speedKph = raw / 100;
    }
    if (flags & 2) take(2); // Averages are not instantaneous samples.
    if (flags & 4) {
      const raw = value.getUint16(take(2), true);
      if (raw !== 65535) metrics.cadenceRpm = raw / 2;
    }
    if (flags & 8) take(2);
    if (flags & 16) {
      const from = take(3);
      const raw =
        value.getUint8(from) | (value.getUint8(from + 1) << 8) | (value.getUint8(from + 2) << 16);
      if (raw !== 0xffffff) metrics.distanceMeters = raw;
    }
    if (flags & 32) take(2);
    if (flags & 64) {
      const raw = value.getInt16(take(2), true);
      if (raw !== 32767) metrics.powerWatts = raw;
    }
    if (flags & 128) take(2);
    if (flags & 256) {
      const raw = value.getUint16(take(5), true);
      if (raw !== 65535) metrics.calories = raw;
    }
    if (flags & 512) {
      const raw = value.getUint8(take(1));
      if (raw !== 255) metrics.heartRateBpm = raw;
    }
    if (flags & 1024) take(1);
    if (flags & 2048) take(2);
    if (flags & 4096) take(2);
    return metrics;
  } catch {
    return {};
  }
}
export function decodeCyclingPower(value: DataView): Pick<WebBluetoothMetrics, "powerWatts"> {
  const parsed = parseCyclingPowerMeasurementWithState(
    new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
  );
  return { powerWatts: parsed.truncated ? null : parsed.powerWatts };
}

export class WebBluetoothRecorder {
  private state: WebBluetoothState;
  private listeners = new Set<(state: WebBluetoothState) => void>();
  private notificationListeners = new Set<(notification: MeasuredNotification) => void>();
  private notificationSequence = 0;
  private connectionId = "";
  private freshnessTimers = new Map<keyof WebBluetoothMetrics, ReturnType<typeof setTimeout>>();
  private lastCounterNotificationAt: number | null = null;
  private device: BluetoothDevice | null = null;
  private controlPoint: BluetoothCharacteristic | null = null;
  private subscriptions: { characteristic: BluetoothCharacteristic; listener: EventListener }[] =
    [];
  private connectionGeneration = 0;
  private commandQueue: Promise<void> = Promise.resolve();
  private pendingControl: { opcode: number; resolve: (success: boolean) => void } | null = null;
  private sessionMetricDeltas: WebBluetoothSessionMetricDeltas = {
    distanceMeters: null,
    calories: null,
  };
  private sessionMetricBaselines: WebBluetoothSessionMetricDeltas = {
    distanceMeters: null,
    calories: null,
  };
  private sessionMetricLastValues: WebBluetoothSessionMetricDeltas = {
    distanceMeters: null,
    calories: null,
  };
  private sessionMetricsActive = false;
  private readonly disconnected = () => {
    this.cleanup(false);
    this.update({
      status: "disconnected",
      deviceName: null,
      controlEligible: false,
      controlGranted: false,
      targetPowerSupported: false,
      metrics: emptyMetrics(),
      error: "The Bluetooth device disconnected. Move it closer, wake it, then connect it again.",
    });
  };
  constructor(
    private readonly navigatorLike:
      | BluetoothNavigator
      | undefined = globalThis.navigator as BluetoothNavigator,
  ) {
    const supported = isWebBluetoothSupported(navigatorLike);
    this.state = supported
      ? { ...webBluetoothServerSnapshot(), supported: true, status: "idle" }
      : webBluetoothServerSnapshot();
  }
  getState = () => this.state;
  subscribe = (listener: (state: WebBluetoothState) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  subscribeNotifications = (listener: (notification: MeasuredNotification) => void) => {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  };
  private update(next: Partial<WebBluetoothState>) {
    this.state = { ...this.state, ...next, metrics: next.metrics ?? this.state.metrics };
    for (const listener of this.listeners) listener(this.state);
  }
  private addNotifications(
    characteristic: BluetoothCharacteristic,
    decode: (view: DataView) => Partial<WebBluetoothMetrics>,
    kind: "indoorBike" | "heartRate" | "cyclingPower",
  ) {
    const generation = this.connectionGeneration;
    const sourceId = `${this.connectionId}:${kind}`;
    const listener: EventListener = () => {
      if (characteristic.value && this.isCurrent(generation)) {
        const recordedAt = new Date(Date.now()).toISOString();
        const sequenceNumber = ++this.notificationSequence;
        let metrics: Partial<WebBluetoothMetrics>;
        try {
          metrics = decode(characteristic.value);
        } catch {
          return;
        }
        const samples: MeasuredMetricSample[] = [];
        for (const [key, metricFamily, unit, sourceType] of [
          [
            "heartRateBpm",
            "heart_rate",
            "bpm",
            kind === "heartRate" ? "heart_rate_sensor" : "trainer_passthrough",
          ],
          [
            "powerWatts",
            "power",
            "watts",
            kind === "cyclingPower" ? "power_meter" : "trainer_power",
          ],
          ["cadenceRpm", "cadence", "rpm", "trainer_cadence"],
          ["speedKph", "speed", "meters_per_second", "trainer_speed"],
          ["distanceMeters", "distance", "meters", "trainer_speed"],
        ] as const) {
          const value = metrics[key];
          if (value === null || value === undefined) continue;
          const sample = measuredMetricSampleSchema.safeParse({
            metricFamily,
            unit,
            value: key === "speedKph" ? value / 3.6 : value,
            recordedAt,
            sequenceNumber,
            source: { sourceId, sourceType, provenance: "actual", adapterId: "web-bluetooth" },
          });
          if (sample.success) samples.push(sample.data);
          else metrics[key] = null;
        }
        if (
          metrics.calories !== undefined &&
          metrics.calories !== null &&
          (!Number.isFinite(metrics.calories) || metrics.calories < 0 || metrics.calories > 65534)
        )
          metrics.calories = null;
        const notification = measuredNotificationSchema.safeParse({
          origin: "bluetooth_notification",
          sourceId,
          recordedAt,
          sequenceNumber,
          samples,
          ...(metrics.calories === null || metrics.calories === undefined
            ? {}
            : { caloriesCounterKcal: metrics.calories }),
        });
        if (notification.success && kind === "indoorBike")
          this.captureSessionMetricDeltas(metrics, Date.parse(recordedAt));
        this.update({ metrics: { ...this.state.metrics, ...metrics } });
        for (const key of Object.keys(metrics) as (keyof WebBluetoothMetrics)[]) {
          clearTimeout(this.freshnessTimers.get(key));
          this.freshnessTimers.set(
            key,
            setTimeout(
              () => this.update({ metrics: { ...this.state.metrics, [key]: null } }),
              MEASURED_SOURCE_FRESHNESS_MS,
            ),
          );
        }
        if (notification.success)
          for (const callback of this.notificationListeners) callback(notification.data);
      }
    };
    characteristic.addEventListener("characteristicvaluechanged", listener);
    this.subscriptions.push({ characteristic, listener });
    return characteristic.startNotifications();
  }
  private async optionalCharacteristic(service: BluetoothService, uuid: string) {
    try {
      return await service.getCharacteristic(uuid);
    } catch {
      return null;
    }
  }
  private async optionalService(
    server: { getPrimaryService(uuid: string): Promise<BluetoothService> },
    uuid: string,
  ) {
    try {
      return await server.getPrimaryService(uuid);
    } catch {
      return null;
    }
  }
  private isCurrent(generation: number) {
    return generation === this.connectionGeneration;
  }
  private retainConnection(generation: number, device: BluetoothDevice): boolean {
    if (this.isCurrent(generation)) return true;
    // A cancelled attempt owns only its local device, never the replacement's
    // subscriptions/control point. A reused device may already have a new owner.
    if (this.device !== device && device.gatt?.connected) device.gatt.disconnect();
    return false;
  }
  beginSessionMetrics(
    totals: WebBluetoothSessionMetricDeltas = { distanceMeters: null, calories: null },
  ) {
    this.sessionMetricsActive = true;
    this.sessionMetricDeltas = { ...totals };
    this.clearSessionMetricBaselines();
  }
  getSessionMetricDeltas(): WebBluetoothSessionMetricDeltas {
    return { ...this.sessionMetricDeltas };
  }
  endSessionMetrics() {
    this.sessionMetricsActive = false;
    this.clearSessionMetricBaselines();
  }
  pauseSessionMetrics() {
    this.endSessionMetrics();
  }
  resumeSessionMetrics() {
    this.sessionMetricsActive = true;
    this.clearSessionMetricBaselines();
  }
  private clearSessionMetricBaselines() {
    this.sessionMetricBaselines = { distanceMeters: null, calories: null };
    this.sessionMetricLastValues = { distanceMeters: null, calories: null };
    this.lastCounterNotificationAt = null;
  }
  private captureSessionMetricDeltas(metrics: Partial<WebBluetoothMetrics>, at: number) {
    if (!this.sessionMetricsActive) return;
    // A sparse counter may span many fresh packets. Reset on a source gap,
    // not merely because this individual optional field was absent.
    if (
      this.lastCounterNotificationAt !== null &&
      at - this.lastCounterNotificationAt > MEASURED_SOURCE_FRESHNESS_MS
    )
      this.clearSessionMetricBaselines();
    this.lastCounterNotificationAt = at;
    for (const key of ["distanceMeters", "calories"] as const) {
      const next = metrics[key];
      if (next === null || next === undefined) continue;
      const previous = this.sessionMetricLastValues[key] ?? this.sessionMetricBaselines[key];
      if (previous === null || next < previous) {
        this.sessionMetricBaselines[key] = next;
        this.sessionMetricLastValues[key] = next;
        // A reconnect establishes a new baseline but must retain the portion already
        // observed during this recording session.
        continue;
      }
      const increment = next - previous;
      this.sessionMetricDeltas[key] = (this.sessionMetricDeltas[key] ?? 0) + increment;
      this.sessionMetricLastValues[key] = next;
    }
  }
  async connect() {
    if (
      !this.state.supported ||
      !this.navigatorLike?.bluetooth ||
      this.state.status === "connecting" ||
      this.state.status === "connected"
    )
      return;
    if (globalThis.isSecureContext === false) {
      this.update({
        status: "error",
        error:
          "Bluetooth requires a secure (HTTPS) page. Open this recorder over HTTPS and try again.",
      });
      return;
    }
    const generation = ++this.connectionGeneration;
    this.update({ status: "connecting", error: null });
    try {
      if (!globalThis.crypto?.randomUUID)
        throw new Error(
          "Secure Bluetooth recording requires Web Crypto support in a current browser.",
        );
      this.connectionId = globalThis.crypto.randomUUID();
      this.notificationSequence = 0;
      const device = await this.navigatorLike.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: Object.values(services),
      });
      if (!this.isCurrent(generation)) return;
      if (!device.gatt)
        throw new Error("The selected device does not expose a Bluetooth GATT server.");
      this.device = device;
      device.addEventListener("gattserverdisconnected", this.disconnected);
      const server = await device.gatt.connect();
      if (!this.retainConnection(generation, device)) return;
      const [ftms, hr, power] = await Promise.all([
        this.optionalService(server, services.ftms),
        this.optionalService(server, services.heartRate),
        this.optionalService(server, services.cyclingPower),
      ]);
      if (!this.retainConnection(generation, device)) return;
      if (!ftms && !hr && !power)
        throw new Error(
          "The selected device does not provide supported FTMS, heart-rate, or cycling-power data.",
        );
      if (ftms) {
        const indoor = await this.optionalCharacteristic(ftms, characteristics.indoorBike);
        if (!this.retainConnection(generation, device)) return;
        if (indoor) await this.addNotifications(indoor, decodeIndoorBikeData, "indoorBike");
        if (!this.retainConnection(generation, device)) return;
        const controlPoint = await this.optionalCharacteristic(ftms, characteristics.controlPoint);
        if (!this.retainConnection(generation, device)) return;
        this.controlPoint = controlPoint;
        if (this.controlPoint) await this.listenForControlResponses(this.controlPoint);
        if (!this.retainConnection(generation, device)) return;
      }
      if (hr) {
        const characteristic = await this.optionalCharacteristic(hr, characteristics.heartRate);
        if (!this.retainConnection(generation, device)) return;
        if (characteristic)
          await this.addNotifications(characteristic, decodeHeartRate, "heartRate");
        if (!this.retainConnection(generation, device)) return;
      }
      if (power) {
        const characteristic = await this.optionalCharacteristic(
          power,
          characteristics.cyclingPower,
        );
        if (!this.retainConnection(generation, device)) return;
        if (characteristic)
          await this.addNotifications(characteristic, decodeCyclingPower, "cyclingPower");
      }
      if (!this.retainConnection(generation, device)) return;
      const controlEligible = Boolean(
        this.controlPoint?.properties?.write &&
          this.controlPoint.properties.indicate &&
          this.controlPoint.writeValueWithResponse,
      );
      const feature = ftms
        ? await this.optionalCharacteristic(ftms, characteristics.fitnessMachineFeature)
        : null;
      if (!this.retainConnection(generation, device)) return;
      let targetPowerSupported = false;
      try {
        targetPowerSupported = Boolean(
          controlEligible &&
            feature?.readValue &&
            decodeFitnessMachineFeature(await feature.readValue()).targetPowerSupported,
        );
      } catch {
        targetPowerSupported = false;
      }
      if (!this.retainConnection(generation, device)) return;
      this.update({
        status: "connected",
        deviceName: device.name ?? "Bluetooth device",
        controlEligible,
        targetPowerSupported,
      });
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      this.cleanup();
      this.update({
        status: "error",
        deviceName: null,
        controlEligible: false,
        controlGranted: false,
        targetPowerSupported: false,
        metrics: emptyMetrics(),
        error: webBluetoothErrorMessage(error),
      });
    }
  }
  private async listenForControlResponses(characteristic: BluetoothCharacteristic) {
    const generation = this.connectionGeneration;
    const listener: EventListener = () => {
      if (!this.isCurrent(generation)) return;
      const value = characteristic.value;
      if (!value || value.byteLength < 3 || value.getUint8(0) !== 0x80) return;
      const pending = this.pendingControl;
      if (!pending || pending.opcode !== value.getUint8(1)) return;
      this.pendingControl = null;
      pending.resolve(value.getUint8(2) === 0x01);
    };
    characteristic.addEventListener("characteristicvaluechanged", listener);
    this.subscriptions.push({ characteristic, listener });
    await characteristic.startNotifications();
  }
  private async sendControlCommand(opcode: number, payload: Uint8Array): Promise<boolean> {
    const operation = this.commandQueue
      .catch(() => undefined)
      .then(async () => {
        if (!this.controlPoint?.writeValueWithResponse)
          throw new Error("Trainer control is unavailable.");
        const response = new Promise<boolean>((resolve) => {
          const timeout = globalThis.setTimeout(() => {
            if (this.pendingControl?.opcode === opcode) this.pendingControl = null;
            resolve(false);
          }, 5_000);
          this.pendingControl = {
            opcode,
            resolve: (success) => {
              globalThis.clearTimeout(timeout);
              resolve(success);
            },
          };
        });
        await this.controlPoint.writeValueWithResponse(payload);
        return response;
      });
    this.commandQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  async requestControl() {
    if (!this.state.controlEligible) return false;
    try {
      const granted = await this.sendControlCommand(0x00, serializeFtmsRequestControl());
      this.update({
        controlGranted: granted,
        error: granted ? null : "Trainer did not grant control.",
      });
      return granted;
    } catch (error) {
      this.update({
        error: error instanceof Error ? error.message : "Trainer control request failed.",
      });
      return false;
    }
  }
  async setTargetPower(watts: number) {
    if (!this.state.controlGranted || !this.state.targetPowerSupported) return false;
    try {
      const accepted = await this.sendControlCommand(0x05, serializeFtmsTargetPower(watts));
      if (!accepted) this.update({ error: "Trainer rejected the target power command." });
      return accepted;
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "Trainer command failed." });
      return false;
    }
  }
  disconnect() {
    this.cleanup();
    this.update({
      status: this.state.supported ? "disconnected" : "unavailable",
      deviceName: null,
      controlEligible: false,
      controlGranted: false,
      targetPowerSupported: false,
      metrics: emptyMetrics(),
    });
  }
  private cleanup(disconnectGatt = true) {
    this.connectionGeneration += 1;
    for (const timeout of this.freshnessTimers.values()) clearTimeout(timeout);
    this.freshnessTimers.clear();
    for (const { characteristic, listener } of this.subscriptions) {
      characteristic.removeEventListener("characteristicvaluechanged", listener);
      void characteristic.stopNotifications?.().catch(() => undefined);
    }
    this.subscriptions = [];
    this.device?.removeEventListener("gattserverdisconnected", this.disconnected);
    if (disconnectGatt && this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device = null;
    this.controlPoint = null;
    this.clearSessionMetricBaselines();
    this.pendingControl?.resolve(false);
    this.pendingControl = null;
  }
}
