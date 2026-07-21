import { describe, expect, it } from "vitest";
import {
  ACTIVE_INTENSITY_COLOR_THEME,
  getIntensityZoneColor,
  getIntensityZoneForegroundColor,
  INTENSITY_COLOR_THEMES,
  INTENSITY_ZONES,
} from "../zones";

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(background: string, foreground: string): number {
  const lighter = Math.max(relativeLuminance(background), relativeLuminance(foreground));
  const darker = Math.min(relativeLuminance(background), relativeLuminance(foreground));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("intensity color themes", () => {
  it("uses one selected palette for every intensity zone", () => {
    expect(ACTIVE_INTENSITY_COLOR_THEME).toBe("spectrum");
    expect(INTENSITY_ZONES.RECOVERY.color).toBe(
      INTENSITY_COLOR_THEMES.spectrum.RECOVERY.background,
    );
    expect(INTENSITY_ZONES.NEUROMUSCULAR.color).toBe(
      INTENSITY_COLOR_THEMES.spectrum.NEUROMUSCULAR.background,
    );
  });

  it("allows consumers to select another complete palette", () => {
    expect(getIntensityZoneColor("TEMPO", "classic")).toBe(
      INTENSITY_COLOR_THEMES.classic.TEMPO.background,
    );
    expect(getIntensityZoneForegroundColor("TEMPO", "classic")).toBe(
      INTENSITY_COLOR_THEMES.classic.TEMPO.foreground,
    );
  });

  it("keeps every palette foreground readable over its background", () => {
    for (const palette of Object.values(INTENSITY_COLOR_THEMES)) {
      for (const colors of Object.values(palette)) {
        expect(contrastRatio(colors.background, colors.foreground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
