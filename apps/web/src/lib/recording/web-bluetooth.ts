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
  if (value.byteLength < 2) return { heartRateBpm: null };
  const flags = value.getUint8(0);
  if (flags & 1) {
    return { heartRateBpm: value.byteLength >= 3 ? value.getUint16(1, true) : null };
  }
  return { heartRateBpm: value.getUint8(1) };
}
export function decodeIndoorBikeData(value: DataView): Partial<WebBluetoothMetrics> {
  const flags = value.getUint16(0, true);
  let offset = 2;
  const metrics: Partial<WebBluetoothMetrics> = {};
  const read = (bytes: number) => {
    if (offset + bytes > value.byteLength) return false;
    return true;
  };
  if (!(flags & 1)) {
    if (!read(2)) return metrics;
    metrics.speedKph = value.getUint16(offset, true) / 100;
    offset += 2;
  }
  if (flags & 2) {
    if (!read(2)) return metrics;
    offset += 2;
  }
  if (flags & 4) {
    if (!read(2)) return metrics;
    metrics.cadenceRpm = value.getUint16(offset, true) / 2;
    offset += 2;
  }
  if (flags & 8) {
    if (!read(2)) return metrics;
    offset += 2;
  }
  if (flags & 16) {
    if (!read(3)) return metrics;
    metrics.distanceMeters =
      value.getUint8(offset) |
      (value.getUint8(offset + 1) << 8) |
      (value.getUint8(offset + 2) << 16);
    offset += 3;
  }
  if (flags & 32) {
    if (!read(2)) return metrics;
    offset += 2;
  }
  if (flags & 64) {
    if (!read(2)) return metrics;
    metrics.powerWatts = value.getInt16(offset, true);
    offset += 2;
  }
  if (flags & 128) {
    if (!read(2)) return metrics;
    offset += 2;
  }
  if (flags & 256) {
    if (!read(5)) return metrics;
    metrics.calories = value.getUint16(offset, true);
    offset += 5;
  }
  if (flags & 512 && read(1)) metrics.heartRateBpm = value.getUint8(offset);
  return metrics;
}
export function decodeCyclingPower(value: DataView): Pick<WebBluetoothMetrics, "powerWatts"> {
  return { powerWatts: value.byteLength >= 4 ? value.getInt16(2, true) : null };
}

export class WebBluetoothRecorder {
  private state: WebBluetoothState;
  private listeners = new Set<(state: WebBluetoothState) => void>();
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
  private update(next: Partial<WebBluetoothState>) {
    this.state = { ...this.state, ...next, metrics: next.metrics ?? this.state.metrics };
    for (const listener of this.listeners) listener(this.state);
  }
  private addNotifications(
    characteristic: BluetoothCharacteristic,
    decode: (view: DataView) => Partial<WebBluetoothMetrics>,
  ) {
    const listener: EventListener = () => {
      if (characteristic.value) {
        const metrics = decode(characteristic.value);
        this.captureSessionMetricDeltas(metrics);
        this.update({ metrics: { ...this.state.metrics, ...metrics } });
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
  beginSessionMetrics() {
    this.sessionMetricsActive = true;
    this.sessionMetricDeltas = { distanceMeters: null, calories: null };
    this.sessionMetricBaselines = {
      distanceMeters: this.state.metrics.distanceMeters,
      calories: this.state.metrics.calories,
    };
    this.sessionMetricLastValues = { ...this.sessionMetricBaselines };
  }
  getSessionMetricDeltas(): WebBluetoothSessionMetricDeltas {
    return { ...this.sessionMetricDeltas };
  }
  endSessionMetrics() {
    this.sessionMetricsActive = false;
  }
  private clearSessionMetricBaselines() {
    this.sessionMetricBaselines = { distanceMeters: null, calories: null };
    this.sessionMetricLastValues = { distanceMeters: null, calories: null };
  }
  private captureSessionMetricDeltas(metrics: Partial<WebBluetoothMetrics>) {
    if (!this.sessionMetricsActive) return;
    for (const key of ["distanceMeters", "calories"] as const) {
      const next = metrics[key];
      if (next === null || next === undefined) continue;
      const previous = this.sessionMetricLastValues[key] ?? this.sessionMetricBaselines[key];
      if (previous === null) {
        this.sessionMetricBaselines[key] = next;
        this.sessionMetricLastValues[key] = next;
        // A reconnect establishes a new baseline but must retain the portion already
        // observed during this recording session.
        this.sessionMetricDeltas[key] ??= 0;
        continue;
      }
      const increment = next >= previous ? next - previous : next;
      this.sessionMetricDeltas[key] = (this.sessionMetricDeltas[key] ?? 0) + increment;
      this.sessionMetricLastValues[key] = next;
    }
  }
  async connect() {
    if (
      !this.state.supported ||
      !this.navigatorLike?.bluetooth ||
      this.state.status === "connecting"
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
      if (!this.isCurrent(generation)) {
        this.cleanup();
        return;
      }
      const [ftms, hr, power] = await Promise.all([
        this.optionalService(server, services.ftms),
        this.optionalService(server, services.heartRate),
        this.optionalService(server, services.cyclingPower),
      ]);
      if (!this.isCurrent(generation)) {
        this.cleanup();
        return;
      }
      if (!ftms && !hr && !power)
        throw new Error(
          "The selected device does not provide supported FTMS, heart-rate, or cycling-power data.",
        );
      if (ftms) {
        const indoor = await this.optionalCharacteristic(ftms, characteristics.indoorBike);
        if (indoor) await this.addNotifications(indoor, decodeIndoorBikeData);
        this.controlPoint = await this.optionalCharacteristic(ftms, characteristics.controlPoint);
        if (this.controlPoint) await this.listenForControlResponses(this.controlPoint);
      }
      if (hr) {
        const characteristic = await this.optionalCharacteristic(hr, characteristics.heartRate);
        if (characteristic) await this.addNotifications(characteristic, decodeHeartRate);
      }
      if (power) {
        const characteristic = await this.optionalCharacteristic(
          power,
          characteristics.cyclingPower,
        );
        if (characteristic) await this.addNotifications(characteristic, decodeCyclingPower);
      }
      if (!this.isCurrent(generation)) {
        this.cleanup();
        return;
      }
      const controlEligible = Boolean(
        this.controlPoint?.properties?.write &&
          this.controlPoint.properties.indicate &&
          this.controlPoint.writeValueWithResponse,
      );
      const feature = ftms
        ? await this.optionalCharacteristic(ftms, characteristics.fitnessMachineFeature)
        : null;
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
        error: webBluetoothErrorMessage(error),
      });
    }
  }
  private async listenForControlResponses(characteristic: BluetoothCharacteristic) {
    const listener: EventListener = () => {
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
    for (const { characteristic, listener } of this.subscriptions) {
      characteristic.removeEventListener("characteristicvaluechanged", listener);
      void characteristic.stopNotifications?.();
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
