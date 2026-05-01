import { Platform } from "react-native";
import { getServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

type MobileActionPhase = "attempt" | "success" | "failure";

type MobileActionLogDetails = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE_DETAIL_KEY_PATTERN =
  /(authorization|cookie|email|lat|latitude|lng|longitude|password|path|signed|token|url)/i;

function isDevBuild() {
  return Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
}

export function isMobileActionLoggingEnabled() {
  return isDevBuild() || process.env.EXPO_PUBLIC_ENABLE_MOBILE_LOGS === "1";
}

export function sanitizeMobileActionDetails(details: MobileActionLogDetails) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      SENSITIVE_DETAIL_KEY_PATTERN.test(key) ? "[redacted]" : value,
    ]),
  );
}

function getExpoConstants() {
  try {
    return require("expo-constants").default as {
      isDevice?: boolean;
      deviceName?: string | null;
    };
  } catch {
    return null;
  }
}

function inferDeviceKind() {
  const expoConstants = getExpoConstants();

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

function getActorSnapshot() {
  const authState = useAuthStore.getState();
  const session = authState.session;

  return {
    actorType: session?.user ? "authenticated" : "guest",
    authReady: authState.ready,
    authLoading: authState.loading,
  };
}

function getAppMetadata() {
  const expoConstants = getExpoConstants();
  const expoConfig = (expoConstants as { expoConfig?: Record<string, unknown> } | null)?.expoConfig;

  return {
    appVersion:
      typeof expoConfig?.version === "string"
        ? expoConfig.version
        : typeof expoConfig?.version === "number"
          ? String(expoConfig.version)
          : null,
    appScheme:
      typeof expoConfig?.scheme === "string"
        ? expoConfig.scheme
        : Array.isArray(expoConfig?.scheme)
          ? expoConfig.scheme.join(",")
          : null,
  };
}

function getApiHost() {
  if (typeof getServerConfig !== "function") {
    return "unknown";
  }

  try {
    return new URL(getServerConfig().apiUrl).host;
  } catch {
    try {
      return getServerConfig().apiUrl;
    } catch {
      return "unknown";
    }
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
  if (!isMobileActionLoggingEnabled()) {
    return;
  }

  const record = {
    ts: new Date().toISOString(),
    source: "mobile",
    platform: Platform.OS,
    deviceKind: inferDeviceKind(),
    ...getAppMetadata(),
    apiHost: getApiHost(),
    action,
    phase,
    ...getActorSnapshot(),
    details: sanitizeMobileActionDetails(details),
  };

  console.log(`[mobile-log] ${JSON.stringify(record)}`);
}
