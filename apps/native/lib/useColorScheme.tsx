import { useColorScheme as useNativeColorScheme } from "react-native";

export function useColorScheme() {
  const nativeColorScheme = useNativeColorScheme();
  const colorScheme = nativeColorScheme ?? "dark";

  return {
    colorScheme,
    isDarkColorScheme: colorScheme === "dark",
    setColorScheme: () => {
      // TODO: Implement theme switching
      console.log("Theme switching not implemented yet");
    },
    toggleColorScheme: () => {
      // TODO: Implement theme toggling
      console.log("Theme toggling not implemented yet");
    },
  };
}
