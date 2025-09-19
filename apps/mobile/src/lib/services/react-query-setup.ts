import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, Platform } from "react-native";

export const setupNetworkListener = () => {
  const unsubscribe = onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(!!state.isConnected);
    });
    return () => subscription?.remove();
  });

  return unsubscribe;
};

export const setupFocusManager = () => {
  const onAppStateChange = (status: string) => {
    if (Platform.OS !== "web") {
      focusManager.setFocused(status === "active");
    }
  };

  const subscription = AppState.addEventListener("change", onAppStateChange);
  return () => subscription?.remove();
};
