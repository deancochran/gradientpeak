import { ConfigContext, ExpoConfig } from "expo/config";
import { version } from "./package.json";

const EAS_PROJECT_ID = "c891c73b-ec96-4a19-ba21-9574d28ea5db";
const PROJECT_SLUG = "turbo-fit";
const OWNER = "deancochran";

const APP_NAME = "Turbo Fit";
const BUNDLE_IDENTIFIER = "com.company.turbofit";
const PACKAGE_NAME = "com.company.turbofit";
const ICON = "./assets/images/icons/splash-icon-prod.png";
const ADAPTIVE_ICON = "./assets/images/icons/splash-icon-prod.png";
const SCHEME = "app-scheme";

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, bundleIdentifier, icon, adaptiveIcon, packageName, scheme } =
    getDynamicAppConfig(
      (process.env.APP_ENV as "development" | "preview" | "production") ||
        "development",
    );

  return {
    ...config,
    name,
    version,
    slug: PROJECT_SLUG,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true, // Required for TurboModules
    icon,
    scheme,
    ios: {
      bundleIdentifier,
      supportsTablet: true,
      infoPlist: {
        UIBackgroundModes: ["location", "fetch"],
        NSBluetoothAlwaysUsageDescription:
          "This app needs Bluetooth to connect to your devices.",
        NSLocationWhenInUseUsageDescription:
          "This app needs your location to track activities.",
        NSMotionUsageDescription:
          "This app needs motion access to track your activity.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: adaptiveIcon,
        backgroundColor: "#ffffff",
      },
      package: packageName,
      edgeToEdgeEnabled: true,
      permissions: [
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACTIVITY_RECOGNITION",
      ],
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
    plugins: [
      [
        "expo-router",
        {
          root: "./src/routes",
        },
      ],
      "expo-build-properties",
      "expo-secure-store",
      "expo-sqlite",
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
          bluetoothAlwaysPermission:
            "Allow $(PRODUCT_NAME) to connect to bluetooth devices",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      buildCacheProvider: "eas",
    },
    owner: OWNER,
  };
};

export const getDynamicAppConfig = (
  environment: "development" | "preview" | "production",
) => {
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
