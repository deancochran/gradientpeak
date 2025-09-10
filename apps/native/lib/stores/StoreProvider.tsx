import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { initializeStores } from './index';

interface StoreProviderProps {
  children: React.ReactNode;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('🏪 StoreProvider: Initializing stores...');
        await initializeStores();
        setInitialized(true);
        console.log('✅ StoreProvider: All stores initialized successfully');
      } catch (error) {
        console.error('❌ StoreProvider: Failed to initialize stores:', error);
        // Still set initialized to true to prevent blocking the app
        setInitialized(true);
      }
    };

    init();
  }, []);

  if (!initialized) {
    // You could show a loading spinner here
    // For now, we'll just render an empty view
    return <View style={{ flex: 1 }} />;
  }

  return <>{children}</>;
};
