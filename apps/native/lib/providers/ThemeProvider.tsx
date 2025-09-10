import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useNativeColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';

interface ThemeContextType {
  colorScheme: ColorScheme;
  isDarkColorScheme: boolean;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colorScheme: 'dark',
  isDarkColorScheme: true,
  setColorScheme: () => {},
  toggleColorScheme: () => {},
});

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const nativeColorScheme = useNativeColorScheme();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(nativeColorScheme || 'dark');

  // Update color scheme when system theme changes
  useEffect(() => {
    if (nativeColorScheme) {
      setColorScheme(nativeColorScheme);
    }
  }, [nativeColorScheme]);

  const toggleColorScheme = () => {
    setColorScheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const value: ThemeContextType = {
    colorScheme,
    isDarkColorScheme: colorScheme === 'dark',
    setColorScheme,
    toggleColorScheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useColorScheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useColorScheme must be used within a ThemeProvider');
  }
  return context;
};
