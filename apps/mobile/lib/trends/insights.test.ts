import { describe, expect, it } from "vitest";
import { hydrateTrendInsights, type ServerTrendInsight } from "./insights";

const baseInsight = {
  category: "Recent outputs",
  compactLayout: "summaryFooter",
  detail: "Detail",
  direction: "up",
  icon: "zap",
  points: [],
  rows: [],
  source: "activityAnalysis",
  summary: "Stored activity name",
  title: "Activity Efforts",
  tone: "purple",
  value: "250 W",
  visualType: "scatter",
} satisfies Omit<ServerTrendInsight, "id">;

describe("hydrateTrendInsights", () => {
  it("maps recorded activity names to generic performance and ranking labels", () => {
    const insights = hydrateTrendInsights([
      { ...baseInsight, id: "performance" },
      {
        ...baseInsight,
        id: "peak-power",
        rows: [
          { label: "#1 Private hill repeats", value: "900 W" },
          { label: "#2 Secret commute", value: "850 W" },
        ],
      },
    ]);

    expect(insights[0]?.summary).toBe("Latest completed activity");
    expect(insights[1]?.summary).toBe("Top recorded effort");
    expect(insights[1]?.rows.map((row) => row.label)).toEqual(["#1 Activity", "#2 Activity"]);
    expect(JSON.stringify(insights)).not.toContain("Private hill repeats");
    expect(JSON.stringify(insights)).not.toContain("Secret commute");
    expect(JSON.stringify(insights)).not.toContain("Stored activity name");
  });
});
