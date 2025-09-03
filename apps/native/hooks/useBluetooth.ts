import { useCallback, useEffect, useState } from "react";
import { BleManager, Device, ScanOptions } from "react-native-ble-plx";

export interface BluetoothDevice extends Device {
  // Keep optional fields you may use in UI
  rssi?: number;
}

const bleManager = new BleManager();

export const useBluetooth = () => {
  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>(
    [],
  );
  const [connectedDevices, setConnectedDevices] = useState<BluetoothDevice[]>(
    [],
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(true);

  // Scan for devices with optional filtering
  const scanForDevices = useCallback(
    (duration = 10000, options?: ScanOptions) => {
      setDiscoveredDevices([]);
      setIsScanning(true);

      bleManager.startDeviceScan(
        options?.services ?? null,
        options,
        (error, device) => {
          if (error) {
            console.error("BLE scan error:", error);
            stopScan();
            return;
          }
          if (!device?.name) return; // filter out unknown devices

          setDiscoveredDevices((prev) => {
            const exists = prev.find((d) => d.id === device.id);
            if (exists) return prev;
            return [...prev, device].sort(
              (a, b) => (b.rssi ?? -999) - (a.rssi ?? -999),
            );
          });
        },
      );

      // Auto-stop scan after `duration`
      const timeout = setTimeout(stopScan, duration);
      return () => clearTimeout(timeout);
    },
    [],
  );

  const stopScan = useCallback(() => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
  }, []);

  const connectDevice = useCallback(async (deviceId: string) => {
    try {
      const device = await bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();
      setConnectedDevices((prev) => [...prev, device]);
      return device;
    } catch (err) {
      console.error("Failed to connect to device:", err);
      throw err;
    }
  }, []);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    try {
      await bleManager.cancelDeviceConnection(deviceId);
      setConnectedDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch (err) {
      console.error("Failed to disconnect device:", err);
    }
  }, []);

  const checkBluetoothState = useCallback(async () => {
    const state = await bleManager.state();
    setIsBluetoothEnabled(state === "PoweredOn");
  }, []);

  useEffect(() => {
    checkBluetoothState();
    const subscription = bleManager.onStateChange((state) => {
      setIsBluetoothEnabled(state === "PoweredOn");
    }, true);
    return () => subscription.remove();
  }, [checkBluetoothState]);

  return {
    discoveredDevices,
    connectedDevices,
    scanForDevices,
    stopScan,
    connectDevice,
    disconnectDevice,
    isScanning,
    isBluetoothEnabled,
  };
};
