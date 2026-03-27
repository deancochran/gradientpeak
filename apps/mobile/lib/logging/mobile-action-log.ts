import { Platform } from "react-native";
import { getServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

type MobileActionPhase = "attempt" | "success" | "failure";

type MobileActionLogDetails = Record<string, string | number | boolean | null | undefined>;

function getExpoConstants() {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: runtime optional import for Jest compatibility
    return require("expo-constants").default as any;
  } catch {
    return null;
  }
}

function inferDeviceKind() {
  const expoConstants = getExpoConstants() as {
    isDevice?: boolean;
    deviceName?: string | null;
  } | null;

  if (expoConstants?.isDevice === false) {
    return Platform.OS === "ios" ? "ios-simulator" : "android-emulator";
  }

  if (expoConstants?.isDevice === true) {
    return Platform.OS === "ios" ? "ios-device" : "android-device";
  }

  if (Platform.OS === "android") {
    const androidConstants = Platform.constants as Record<string, unknown>;
    const fingerprint = String(androidConstants.Fingerprint ?? "");
    const model = String(androidConstants.Model ?? "");
    const brand = String(androidConstants.Brand ?? "");
    const product = String(androidConstants.Product ?? "");
    const emulatorPattern = /(generic|sdk|emulator|simulator|goldfish|ranchu|vbox)/i;

    return emulatorPattern.test(`${fingerprint} ${model} ${brand} ${product}`)
      ? "android-emulator"
      : "android-device";
  }

  return `${Platform.OS}-device`;
}

function getDeviceName() {
  const expoConstants = getExpoConstants() as {
    deviceName?: string | null;
  } | null;

  return expoConstants?.deviceName ?? null;
}

function getActorSnapshot() {
  const session = useAuthStore.getState().session;

  return {
    actorType: session?.user ? "authenticated" : "guest",
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
  };
}

function getApiHost() {
  try {
    return new URL(getServerConfig().apiUrl).host;
  } catch {
    return getServerConfig().apiUrl;
  }
}

export function getMobileDeviceKind() {
  return inferDeviceKind();
}

export function logMobileAction(
  action: string,
  phase: MobileActionPhase,
  details: MobileActionLogDetails = {},
) {
  const record = {
    ts: new Date().toISOString(),
    source: "mobile",
    platform: Platform.OS,
    deviceKind: inferDeviceKind(),
    deviceName: getDeviceName(),
    apiHost: getApiHost(),
    action,
    phase,
    ...getActorSnapshot(),
    details,
  };

  console.log(`[mobile-log] ${JSON.stringify(record)}`);
}
