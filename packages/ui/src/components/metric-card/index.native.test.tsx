import { Activity } from "lucide-react-native";

import { NATIVE_THEME } from "../../lib/native-theme";
import { renderNative } from "../../test/render-native";
import { metricCardFixtures } from "./fixtures";
import { MetricCard } from "./index.native";

describe("MetricCard native", () => {
  it("renders comparison fixture content", () => {
    const { getByText } = renderNative(
      <MetricCard {...metricCardFixtures.distance} icon={Activity} />,
    );

    expect(getByText(metricCardFixtures.distance.label)).toBeTruthy();
    expect(getByText(String(metricCardFixtures.distance.value))).toBeTruthy();
    expect(getByText(String(metricCardFixtures.distance.comparisonValue))).toBeTruthy();
  });

  it("uses semantic status colors", () => {
    const { getByText } = renderNative(
      <MetricCard {...metricCardFixtures.distance} variant="success" />,
    );

    expect(getByText(String(metricCardFixtures.distance.value)).props.className).toContain(
      "text-success-subtle-foreground",
    );
  });

  it("keeps semantic metric values above the large-text contrast threshold in both themes", () => {
    const semanticForegrounds = [
      "successSubtleForeground",
      "warningForeground",
      "destructive",
    ] as const;

    for (const mode of ["light", "dark"] as const) {
      const theme = NATIVE_THEME[mode];
      for (const foreground of semanticForegrounds) {
        expect(getContrastRatio(theme[foreground], theme.card)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

function getContrastRatio(foreground: string, background: string) {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hexColor: string) {
  const raw = hexColor.replace(/^#/, "");
  const expanded = raw.length === 3 ? raw.replace(/./g, (character) => character.repeat(2)) : raw;
  if (!/^[\da-f]{6}$/i.test(expanded)) {
    throw new Error(`Expected a six-digit hex color, received ${hexColor}`);
  }

  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(expanded.slice(offset, offset + 2), 16),
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
