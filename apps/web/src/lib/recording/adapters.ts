export type WebRecordingAdapterCapability =
  | "manual-timer"
  | "durable-submission"
  | "file-import"
  | "desktop-ble-ftms"
  | "browser-ble-transport";

export type WebRecordingAdapterStatus =
  | "available"
  | "requires-setup"
  | "experimental"
  | "unavailable";

export type WebRecordingRuntime = {
  bluetoothAvailable: boolean;
  secureContext: boolean;
};

export type WebRecordingAdapter = {
  id: "manual-timer" | "file-import" | "desktop-bridge" | "browser-ble";
  label: string;
  description: string;
  capabilities: WebRecordingAdapterCapability[];
  status: WebRecordingAdapterStatus;
  statusLabel: string;
  handoffPath?: "/record/submit";
  liveRecording: boolean;
  durableLocalQueue: boolean;
  bleScanning: boolean;
  ftmsMeasurement: boolean;
  ftmsControl: boolean;
};

export const defaultWebRecordingRuntime: WebRecordingRuntime = {
  bluetoothAvailable: false,
  secureContext: false,
};

export function createWebRecordingAdapterRegistry(
  runtime: WebRecordingRuntime = defaultWebRecordingRuntime,
): WebRecordingAdapter[] {
  return [
    {
      id: "manual-timer",
      label: "Browser-equal timer",
      description: "Foreground timer, durable recovery, review, and queued server submission.",
      capabilities: ["manual-timer", "durable-submission"],
      status: "available",
      statusLabel: "Available in every supported browser",
      liveRecording: true,
      durableLocalQueue: true,
      bleScanning: false,
      ftmsMeasurement: false,
      ftmsControl: false,
    },
    {
      id: "file-import",
      label: "File import",
      description: "Upload a completed activity file through the existing ingestion handoff.",
      capabilities: ["file-import"],
      status: "available",
      statusLabel: "Available now",
      handoffPath: "/record/submit",
      liveRecording: false,
      durableLocalQueue: true,
      bleScanning: false,
      ftmsMeasurement: false,
      ftmsControl: false,
    },
    {
      id: "desktop-bridge",
      label: "Desktop bridge",
      description:
        "Planned native bridge for durable BLE/FTMS sessions, reconnects, and trainer control.",
      capabilities: ["desktop-ble-ftms"],
      status: "requires-setup",
      statusLabel: "Desktop runtime adapter required",
      liveRecording: true,
      durableLocalQueue: true,
      bleScanning: true,
      ftmsMeasurement: true,
      ftmsControl: true,
    },
    {
      id: "browser-ble",
      label: "Browser BLE transport",
      description:
        "Optional foreground transport only. Web Bluetooth availability does not make web recording full parity.",
      capabilities: ["browser-ble-transport"],
      status: runtime.bluetoothAvailable && runtime.secureContext ? "experimental" : "unavailable",
      statusLabel:
        runtime.bluetoothAvailable && runtime.secureContext
          ? "Optional browser transport"
          : "Browser unsupported",
      liveRecording: false,
      durableLocalQueue: false,
      bleScanning: runtime.bluetoothAvailable && runtime.secureContext,
      ftmsMeasurement: false,
      ftmsControl: false,
    },
  ];
}

export function browserRecordingRuntime(): WebRecordingRuntime {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return defaultWebRecordingRuntime;
  }

  return {
    bluetoothAvailable: "bluetooth" in navigator,
    secureContext: window.isSecureContext,
  };
}
