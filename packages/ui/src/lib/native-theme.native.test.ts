import { getResolvedNativeTheme, NATIVE_THEME } from "./native-theme";

describe("NATIVE_THEME", () => {
  it("resolves dark mode explicitly and defaults other schemes to light", () => {
    expect(getResolvedNativeTheme("dark")).toBe(NATIVE_THEME.dark);
    expect(getResolvedNativeTheme("light")).toBe(NATIVE_THEME.light);
    expect(getResolvedNativeTheme(null)).toBe(NATIVE_THEME.light);
  });
});
