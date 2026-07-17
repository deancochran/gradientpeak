export type WebRecordingAdapterCapability =
  | "file-import"
  | "desktop-ble-ftms"
  | "browser-ble-transport";

export type WebRecordingAdapterStatus = "available" | "planned" | "experimental" | "unavailable";

export type WebRecordingRuntime = {
  bluetoothAvailable: boolean;
  secureContext: boolean;
};

export type WebRecordingAdapter = {
  id: "file-import" | "desktop-bridge" | "browser-ble";
  label: string;
  description: string;
  capabilities: WebRecordingAdapterCapability[];
  status: WebRecordingAdapterStatus;
  statusLabel: string;
  handoffPath?: "/record/submit";
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
      id: "file-import",
      label: "File import",
      description: "Upload a completed activity file through the existing ingestion handoff.",
      capabilities: ["file-import"],
      status: "available",
      statusLabel: "Available now",
      handoffPath: "/record/submit",
    },
    {
      id: "desktop-bridge",
      label: "Desktop bridge",
      description:
        "Planned native bridge for durable BLE/FTMS sessions, reconnects, and trainer control.",
      capabilities: ["desktop-ble-ftms"],
      status: "planned",
      statusLabel: "Required for parity",
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
