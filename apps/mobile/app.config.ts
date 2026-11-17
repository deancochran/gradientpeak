import { withSentry } from "@sentry/react-native/expo";
import type { ConfigContext, ExpoConfig } from "expo/config";
import { createMobileSentryOptions } from "./lib/services/sentry-options.js";
import { version } from "./package.json";

const EAS_PROJECT_ID = "6d9b541c-ffca-46c3-b323-af579ff46b68";
const PROJECT_SLUG = "gradientpeak";
const OWNER = "deancochran";

const APP_NAME = "GradientPeak";
const BUNDLE_IDENTIFIER = "com.deancochran.gradientpeak";
const PACKAGE_NAME = "com.deancochran.gradientpeak";
const ICON = "./assets/images/icons/splash-icon-prod.png";
const ADAPTIVE_ICON = "./assets/images/icons/splash-icon-prod.png";
const SCHEME = "gradientpeak";

const RUNTIME_VERSION_POLICY = { policy: "fingerprint" } as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") || "development";
  const { name, bundleIdentifier, icon, adaptiveIcon, packageName, scheme } =
    getDynamicAppConfig(environment);

  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const sentryOrganization = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN);

  const expoConfig: ExpoConfig = {
    ...config,
    name,
    version,
    slug: PROJECT_SLUG,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon,
    scheme,
    ios: {
      bundleIdentifier,
      supportsTablet: true,
      infoPlist: {
        UIBackgroundModes: [
          "fetch",
          "background-processing",
          "bluetooth-central",
          "remote-notification", // needed for background notifications
        ],
        NSBluetoothAlwaysUsageDescription: "This app needs Bluetooth to connect to your devices.",
        NSMotionUsageDescription: "This app needs motion access to track your activity.",
        NSHealthShareUsageDescription:
          "This app needs access to your health data to sync your activities and biometrics.",
        NSHealthUpdateUsageDescription:
          "This app needs access to update your health data with your activities.",
        UNNotificationAlertStyle: "alert",
        ...getDevelopmentTransportSecurity(environment),
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: adaptiveIcon,
        backgroundColor: "#ffffff",
      },
      package: packageName,
      permissions: [
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACTIVITY_RECOGNITION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.WAKE_LOCK",
        "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        "android.permission.POST_NOTIFICATIONS",
      ],
      config:
        process.env.EXPO_PUBLIC_GOOGLE_API_KEY === undefined
          ? {}
          : { googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY } },
    },
    updates:
      environment === "development"
        ? {
            enabled: false,
          }
        : {
            url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
          },
    runtimeVersion: environment === "development" ? "development" : RUNTIME_VERSION_POLICY,
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
      // OAuth and API configuration
      appEnv: environment,
      redirectUri: process.env.EXPO_PUBLIC_REDIRECT_URI || `${scheme}://integrations`,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      sentryDsn,
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    },
    plugins: [
      "expo-router",
      "expo-web-browser",
      ...(environment === "development"
        ? ["expo-build-properties" as NonNullable<ExpoConfig["plugins"]>[number]]
        : [
            [
              "expo-build-properties",
              {
                android: {
                  usesCleartextTraffic: environment === "preview",
                },
              },
            ] as NonNullable<ExpoConfig["plugins"]>[number],
          ]),
      "@react-native-community/datetimepicker",
      "expo-font",
      "expo-image",
      "expo-secure-store",
      "expo-sqlite",
      "expo-localization",
      "expo-sharing",
      "expo-status-bar",
      "posthog-react-native/expo",
      ...(environment === "development"
        ? [
            [
              "expo-dev-client",
              {
                launchMode: "launcher",
                android: {
                  launchMode: "launcher",
                },
              },
            ] as NonNullable<ExpoConfig["plugins"]>[number],
          ]
        : []),
      [
        "expo-splash-screen",
        {
          image: "./assets/images/icons/splash-icon-prod.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],
      [
        "react-native-ble-plx",
        {
          isBackgroundEnabled: true,
          modes: ["peripheral", "central"],
          bluetoothAlwaysPermission: "Allow $(PRODUCT_NAME) to connect to bluetooth devices",
        },
      ],
      // [
      //   "expo-notifications",
      //   {
      //     icon: "./assets/images/icons/splash-icon-prod.png",
      //   },
      // ],
    ],
    experiments: {
      typedRoutes: true,
      buildCacheProvider: "eas",
    },
    owner: OWNER,
  };

  return withSentry(expoConfig, {
    disableAutoUpload: !(sentryOrganization && sentryProject && hasSentryAuthToken),
    ...(sentryOrganization === undefined ? {} : { organization: sentryOrganization }),
    ...(sentryProject === undefined ? {} : { project: sentryProject }),
    useNativeInit: Boolean(sentryDsn),
    ...(sentryDsn ? { options: createMobileSentryOptions(process.env, environment) } : {}),
  });
};

export function getDevelopmentTransportSecurity(
  environment: "development" | "preview" | "production",
) {
  if (environment === "production") {
    return {};
  }

  return {
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: true,
      NSExceptionDomains: {
        localhost: {
          NSExceptionAllowsInsecureHTTPLoads: true,
        },
      },
    },
  };
}

export const getDynamicAppConfig = (environment: "development" | "preview" | "production") => {
  if (environment === "production") {
    return {
      name: APP_NAME,
      bundleIdentifier: BUNDLE_IDENTIFIER,
      packageName: PACKAGE_NAME,
      icon: ICON,
      adaptiveIcon: ADAPTIVE_ICON,
      scheme: SCHEME,
    };
  }

  if (environment === "preview") {
    return {
      name: `${APP_NAME} Preview`,
      bundleIdentifier: `${BUNDLE_IDENTIFIER}.preview`,
      packageName: `${PACKAGE_NAME}.preview`,
      icon: "./assets/images/icons/splash-icon-preview.png",
      adaptiveIcon: "./assets/images/icons/splash-icon-preview.png",
      scheme: `${SCHEME}-prev`,
    };
  }

  return {
    name: `${APP_NAME} Development`,
    bundleIdentifier: `${BUNDLE_IDENTIFIER}.dev`,
    packageName: `${PACKAGE_NAME}.dev`,
    icon: "./assets/images/icons/splash-icon-dev.png",
    adaptiveIcon: "./assets/images/icons/splash-icon-dev.png",
    scheme: `${SCHEME}-dev`,
  };
};
