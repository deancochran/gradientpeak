import { describe, expect, it } from "vitest";

import { resolveMetricSource, resolveMetricSources } from "../recording-source-resolver";

describe("recording source resolver", () => {
  it("selects the highest priority available source deterministically", () => {
    const selection = resolveMetricSource("heart_rate", [
      {
        metricFamily: "heart_rate",
        sourceId: "optical-b",
        sourceType: "optical",
        provenance: "actual",
        isAvailable: true,
      },
      {
        metricFamily: "heart_rate",
        sourceId: "strap-a",
        sourceType: "chest_strap",
        provenance: "actual",
        isAvailable: true,
      },
    ]);

    expect(selection.sourceId).toBe("strap-a");
    expect(selection.selectionMethod).toBe("automatic");
  });

  it("prefers an explicit source pin when that source is available", () => {
    const selection = resolveMetricSource(
      "power",
      [
        {
          metricFamily: "power",
          sourceId: "pm-1",
          sourceType: "power_meter",
          provenance: "actual",
          isAvailable: true,
        },
        {
          metricFamily: "power",
          sourceId: "trainer-1",
          sourceType: "trainer_power",
          provenance: "actual",
          isAvailable: true,
        },
      ],
      { preferredSourceId: "trainer-1" },
    );

    expect(selection.sourceId).toBe("trainer-1");
    expect(selection.selectionMethod).toBe("preferred");
  });

  it("falls back to derived data for indoor distance when direct sources are unavailable", () => {
    const selection = resolveMetricSource(
      "distance",
      [
        {
          metricFamily: "distance",
          sourceId: "derived-1",
          sourceType: "derived",
          provenance: "derived",
          isAvailable: true,
        },
      ],
      { isIndoor: true },
    );

    expect(selection.sourceType).toBe("derived");
    expect(selection.provenance).toBe("derived");
    expect(selection.selectionMethod).toBe("fallback");
  });

  it("marks the metric as unavailable when no source can satisfy it", () => {
    const selection = resolveMetricSource("position", []);

    expect(selection.sourceId).toBeNull();
    expect(selection.sourceType).toBeNull();
    expect(selection.provenance).toBe("unavailable");
    expect(selection.selectionMethod).toBe("unavailable");
  });

  it("resolves multiple metric families with family-specific preferences", () => {
    const selections = resolveMetricSources(
      ["power", "cadence"],
      [
        {
          metricFamily: "power",
          sourceId: "pm-1",
          sourceType: "power_meter",
          provenance: "actual",
          isAvailable: true,
        },
        {
          metricFamily: "cadence",
          sourceId: "trainer-1",
          sourceType: "trainer_cadence",
          provenance: "actual",
          isAvailable: true,
        },
        {
          metricFamily: "cadence",
          sourceId: "cadence-1",
          sourceType: "cadence_sensor",
          provenance: "actual",
          isAvailable: true,
        },
      ],
      {
        preferredSourceIds: {
          power: "pm-1",
        },
      },
    );

    expect(selections).toEqual([
      expect.objectContaining({
        metricFamily: "power",
        sourceId: "pm-1",
        selectionMethod: "preferred",
      }),
      expect.objectContaining({
        metricFamily: "cadence",
        sourceId: "cadence-1",
        selectionMethod: "automatic",
      }),
    ]);
  });
});
