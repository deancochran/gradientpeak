// Enhanced PermissionsContext.tsx
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import * as Location from "expo-location";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Alert,
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
} from "react-native";

interface PermissionDetails {
  granted: boolean;
  name: string;
  description: string;
  required: boolean;
}

interface PermissionsContextType {
  permissions: {
    bluetooth: PermissionDetails;
    location: PermissionDetails;
    motion: PermissionDetails;
  };
  allRequiredPermissionsGranted: boolean;
  loadingPermissions: boolean;
  requestPermission: (
    type: "bluetooth" | "location" | "motion",
  ) => Promise<boolean>;
  requestAllPermissions: () => Promise<void>;
  checkPermissions: () => Promise<void>;
  showPermissionRationale: (type: string) => void;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(
  undefined,
);

interface PermissionsProviderProps {
  children: ReactNode;
  blockAppWhenMissing?: boolean; // Allow configurable blocking behavior
}

export const PermissionsProvider = ({
  children,
  blockAppWhenMissing = false,
}: PermissionsProviderProps) => {
  const [permissions, setPermissions] = useState({
    bluetooth: {
      granted: false,
      name: "Bluetooth",
      description: "Connect to heart rate monitors and cycling sensors",
      required: true,
    },
    location: {
      granted: false,
      name: "Location",
      description: "Track your route and calculate distance",
      required: true,
    },
    motion: {
      granted: false,
      name: "Motion & Fitness",
      description: "Detect movement and calculate calories",
      required: false, // Make this optional
    },
  });

  const [loadingPermissions, setLoadingPermissions] = useState(true);

  const allRequiredPermissionsGranted = Object.values(permissions)
    .filter((p) => p.required)
    .every((p) => p.granted);

  const showPermissionRationale = useCallback(
    (type: string) => {
      const permission = permissions[type as keyof typeof permissions];
      if (!permission) return;

      Alert.alert(
        `${permission.name} Permission Required`,
        `This app needs ${permission.name.toLowerCase()} access to ${permission.description.toLowerCase()}. Without this permission, some features may not work properly.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
    },
    [permissions],
  );

  const checkAndroidBLEPermissions = useCallback(async () => {
    if (Platform.OS !== "android") return true;

    const apiLevel = Platform.constants?.Version ?? 0;

    if (apiLevel >= 31) {
      const scan = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      );
      const connect = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      return scan && connect;
    } else {
      // Check for coarse location on older Android versions (needed for BLE scanning)
      const location = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      );
      return location;
    }
  }, []);

  const requestAndroidBLEPermissions = useCallback(async () => {
    if (Platform.OS !== "android") return true;

    const apiLevel = Platform.constants?.Version ?? 0;

    if (apiLevel >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      return (
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        {
          title: "Location Permission for Bluetooth",
          message:
            "This app needs location access to scan for Bluetooth fitness devices like heart rate monitors.",
          buttonPositive: "OK",
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
  }, []);

  const checkLocationPermissions = useCallback(async () => {
    const { granted } = await Location.getForegroundPermissionsAsync();
    return granted;
  }, []);

  const requestLocationPermissions = useCallback(async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted;
  }, []);

  const checkMotionPermissions = useCallback(async () => {
    // For now, assume granted. In a real app, you'd check:
    // - iOS: Motion & Fitness permission
    // - Android: ACTIVITY_RECOGNITION permission
    return Platform.OS === "ios" ? true : true;
  }, []);

  const requestMotionPermissions = useCallback(async () => {
    // Implement actual motion permission request here
    return Platform.OS === "ios" ? true : true;
  }, []);

  const checkPermissions = useCallback(async () => {
    setLoadingPermissions(true);

    const [bluetooth, location, motion] = await Promise.all([
      checkAndroidBLEPermissions(),
      checkLocationPermissions(),
      checkMotionPermissions(),
    ]);

    setPermissions((prev) => ({
      bluetooth: { ...prev.bluetooth, granted: bluetooth },
      location: { ...prev.location, granted: location },
      motion: { ...prev.motion, granted: motion },
    }));

    setLoadingPermissions(false);
  }, [
    checkAndroidBLEPermissions,
    checkLocationPermissions,
    checkMotionPermissions,
  ]);

  const requestPermission = useCallback(
    async (type: "bluetooth" | "location" | "motion") => {
      let granted = false;

      switch (type) {
        case "bluetooth":
          granted = await requestAndroidBLEPermissions();
          break;
        case "location":
          granted = await requestLocationPermissions();
          break;
        case "motion":
          granted = await requestMotionPermissions();
          break;
      }

      setPermissions((prev) => ({
        ...prev,
        [type]: { ...prev[type], granted },
      }));

      return granted;
    },
    [
      requestAndroidBLEPermissions,
      requestLocationPermissions,
      requestMotionPermissions,
    ],
  );

  const requestAllPermissions = useCallback(async () => {
    setLoadingPermissions(true);

    const results = await Promise.all([
      requestAndroidBLEPermissions(),
      requestLocationPermissions(),
      requestMotionPermissions(),
    ]);

    setPermissions((prev) => ({
      bluetooth: { ...prev.bluetooth, granted: results[0] },
      location: { ...prev.location, granted: results[1] },
      motion: { ...prev.motion, granted: results[2] },
    }));

    setLoadingPermissions(false);

    // Show specific feedback about what wasn't granted
    const denied = [];
    if (!results[0]) denied.push("Bluetooth");
    if (!results[1]) denied.push("Location");

    if (denied.length > 0) {
      Alert.alert(
        "Permissions Needed",
        `${denied.join(" and ")} permissions are required for full functionality. You can grant these in Settings.`,
        [
          { text: "Later", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
    }
  }, [
    requestAndroidBLEPermissions,
    requestLocationPermissions,
    requestMotionPermissions,
  ]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        await checkPermissions();
      }
    });
    return () => sub?.remove();
  }, [checkPermissions]);

  // Loading screen
  if (loadingPermissions) {
    return (
      <ThemedView style={styles.centered}>
        <Text>Checking permissions...</Text>
      </ThemedView>
    );
  }

  // Only block if explicitly configured to do so
  if (blockAppWhenMissing && !allRequiredPermissionsGranted) {
    return (
      <ThemedView style={styles.centered}>
        <Text style={styles.title}>Permissions Required</Text>
        <Text style={styles.subtitle}>
          Grant the following permissions to use all features:
        </Text>

        {Object.entries(permissions)
          .filter(([_, p]) => p.required && !p.granted)
          .map(([key, permission]) => (
            <ThemedView key={key} style={styles.permissionItem}>
              <Text style={styles.permissionName}>{permission.name}</Text>
              <Text style={styles.permissionDesc}>
                {permission.description}
              </Text>
            </ThemedView>
          ))}

        <Button onPress={requestAllPermissions} style={styles.permissionButton}>
          Grant Permissions
        </Button>
      </ThemedView>
    );
  }

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        allRequiredPermissionsGranted,
        loadingPermissions,
        requestPermission,
        requestAllPermissions,
        checkPermissions,
        showPermissionRationale,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
};

export const UsePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("UsePermissions must be used within a PermissionsProvider");
  }
  return context;
};

// Export for backward compatibility
export const allPermissionsGranted = () => {
  const { allRequiredPermissionsGranted } = UsePermissions();
  return allRequiredPermissionsGranted;
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  permissionItem: {
    marginBottom: 16,
    alignItems: "center",
  },
  permissionName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  permissionDesc: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  permissionButton: {
    width: "80%",
    maxWidth: 300,
    marginTop: 16,
  },
});
