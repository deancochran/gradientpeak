import { ThemedView } from "@components/ThemedView";
import { Text } from "@components/ui/text";
import React, { createContext, ReactNode, useContext, useEffect } from "react";
import { AppState, StyleSheet } from "react-native";
import { PermissionType, usePermissions } from "../hooks/usePermissions";

const ALL_GLOBAL_PERMISSION_TYPES: PermissionType[] = [
  "bluetooth",
  "location",
  "motion",
  "location-background", // <-- Added this to request background location permission
];

type PermissionsContextType = ReturnType<typeof usePermissions>;

const PermissionsContext = createContext<PermissionsContextType | undefined>(
  undefined,
);

interface PermissionsProviderProps {
  children: ReactNode;
}

export const PermissionsProvider = ({ children }: PermissionsProviderProps) => {
  const permissionsManager = usePermissions(ALL_GLOBAL_PERMISSION_TYPES);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && permissionsManager.checkedOnce) {
        permissionsManager.checkAllRequiredPermissions();
      }
    });
    return () => sub?.remove();
  }, [
    permissionsManager.checkedOnce,
    permissionsManager.checkAllRequiredPermissions,
    permissionsManager,
  ]);

  if (permissionsManager.isLoading && !permissionsManager.checkedOnce) {
    return (
      <ThemedView style={styles.centered}>
        <Text>Checking app permissions...</Text>
      </ThemedView>
    );
  }

  return (
    <PermissionsContext.Provider value={permissionsManager}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const useGlobalPermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error(
      "useGlobalPermissions must be used within a PermissionsProvider",
    );
  }
  return context;
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
});
