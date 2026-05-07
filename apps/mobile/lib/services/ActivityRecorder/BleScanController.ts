import { BLE_SERVICE_UUIDS } from "@repo/core";
import type { BleManager, Device } from "react-native-ble-plx";

const SCAN_SERVICE_UUIDS = [
  BLE_SERVICE_UUIDS.HEART_RATE,
  BLE_SERVICE_UUIDS.CYCLING_SPEED_AND_CADENCE,
  BLE_SERVICE_UUIDS.CYCLING_POWER,
  BLE_SERVICE_UUIDS.RUNNING_SPEED_AND_CADENCE,
  BLE_SERVICE_UUIDS.FITNESS_MACHINE,
];

export class BleScanController {
  private callbacks: Set<(device: Device) => void> = new Set();
  private currentScanTimeout: ReturnType<typeof setTimeout> | number | null = null;
  private currentScanResolve: (() => void) | null = null;

  constructor(
    private readonly bleManager: BleManager,
    private readonly onScanError: (error: Error) => void,
  ) {}

  subscribe(callback: (device: Device) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  async start(timeoutMs = 10000): Promise<void> {
    this.stop();
    const discoveredIds = new Set<string>();

    return new Promise((resolve, reject) => {
      this.currentScanResolve = resolve;
      this.currentScanTimeout = setTimeout(() => {
        this.bleManager.stopDeviceScan();
        this.currentScanTimeout = null;
        this.currentScanResolve = null;
        resolve();
      }, timeoutMs);

      this.bleManager.startDeviceScan(SCAN_SERVICE_UUIDS, null, (error, device) => {
        if (error) {
          this.clearPendingScan();
          this.bleManager.stopDeviceScan();
          this.onScanError(error);
          reject(error);
          return;
        }

        if (!device?.name || discoveredIds.has(device.id)) {
          return;
        }

        discoveredIds.add(device.id);
        this.callbacks.forEach((callback) => callback(device));
      });
    });
  }

  stop(): void {
    this.clearPendingScan();
    this.bleManager.stopDeviceScan();
    this.currentScanResolve?.();
    this.currentScanResolve = null;
  }

  private clearPendingScan(): void {
    if (this.currentScanTimeout) {
      clearTimeout(this.currentScanTimeout);
      this.currentScanTimeout = null;
    }
  }
}
