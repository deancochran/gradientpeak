const baseColors = {
  background: "#ffffff",
  border: "#d1d5db",
  card: "#ffffff",
  notification: "#ef4444",
  primary: "#2563eb",
  text: "#111827",
};

module.exports = {
  DarkTheme: {
    dark: true,
    colors: { ...baseColors, background: "#111827", card: "#111827", text: "#ffffff" },
  },
  DefaultTheme: { dark: false, colors: baseColors },
  ThemeProvider: ({ children }) => children,
  useFocusEffect: () => undefined,
};
