import { router } from "expo-router";
import { useCallback } from "react";

import { EnhancedBluetoothModal } from "@components/modals/EnhancedBluetoothModal";

export default function BluetoothModal() {
  const handleClose = useCallback(() => {
    console.log("🔵 [DEBUG] Bluetooth modal closed via navigation");
    router.back();
  }, []);

  const handleSelectDevice = useCallback((deviceId: string) => {
    console.log("🔵 [DEBUG] Selected enhanced device:", deviceId);
    // Keep modal open for multi-device selection, user can close manually
  }, []);

  return (
    <EnhancedBluetoothModal
      visible={true}
      onClose={handleClose}
      onSelectDevice={handleSelectDevice}
    />
  );
}
