import React, { useEffect } from "react";
import { initializeStores } from "./index";

interface StoreProviderProps {
  children: React.ReactNode;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  useEffect(() => {
    const init = async () => {
      try {
        await initializeStores();
      } catch (error) {
        console.error("StoreProvider: Failed to initialize stores:", error);
      }
    };

    init();
  }, []);

  // Don't block rendering - let stores initialize in the background
  return <>{children}</>;
};
