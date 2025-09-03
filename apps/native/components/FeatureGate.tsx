
import { useGlobalPermissions } from "@/contexts/PermissionsContext";
import { PermissionType } from "@/hooks/usePermissions";
import React, { ReactNode, useEffect } from "react";
import { View, Text, Button, StyleSheet } from "react-native";

interface FeatureGateProps {
  requiredPermissions: PermissionType[];
  title: string;
  description: string;
  children: ReactNode;
  onPermissionsGranted?: () => void;
}

export const FeatureGate = ({ requiredPermissions, title, description, children, onPermissionsGranted }: FeatureGateProps) => {
  const { permissions, requestAllRequiredPermissions, hasAllRequiredPermissions } = useGlobalPermissions();

  const handleRequestPermissions = () => {
    requestAllRequiredPermissions();
  };

  useEffect(() => {
    if (hasAllRequiredPermissions) {
      onPermissionsGranted?.();
    }
  }, [hasAllRequiredPermissions, onPermissionsGranted]);

  const permissionsToCheck = requiredPermissions.every(p => permissions[p]?.granted)

  if (!permissionsToCheck) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <Button title="Grant Permissions" onPress={handleRequestPermissions} />
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
});
