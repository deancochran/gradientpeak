import { describe, expect, it } from "vitest";

import {
  buildCoverageCellSummaries,
  buildSystemActivityTemplateCoverageMatrix,
} from "../verification/activityTemplateCoverageMatrix";

describe("system activity-template coverage", () => {
  it("covers all first-wave run and bike cells with shipped catalog templates", () => {
    const matrix = buildSystemActivityTemplateCoverageMatrix();

    expect(matrix.gap_rows).toEqual([]);
    expect(matrix.first_wave_gate.blocking_cell_keys).toEqual([]);
    expect(matrix.cell_rows.map((row) => row.status)).toEqual([
      "covered",
      "covered",
      "covered",
      "covered",
      "covered",
      "covered",
      "covered",
      "covered",
    ]);
  });

  it("marks under-covered cells when only one first-wave template exists", () => {
    const cellRows = buildCoverageCellSummaries([
      {
        template_id: "run-long-only",
        sport: "run",
        session_archetype: "long_endurance",
        intensity_family: "endurance",
        duration_seconds: 7200,
        primary_work_signature: "long-a",
      },
    ]);

    expect(cellRows.find((row) => row.key === "run_long")?.status).toBe("under-covered");
  });

  it("marks duplicate-risk when near-identical templates occupy the same cell", () => {
    const cellRows = buildCoverageCellSummaries([
      {
        template_id: "bike-long-a",
        sport: "bike",
        session_archetype: "long_endurance",
        intensity_family: "endurance",
        duration_seconds: 9000,
        primary_work_signature: "same-work",
      },
      {
        template_id: "bike-long-b",
        sport: "bike",
        session_archetype: "long_endurance",
        intensity_family: "moderate",
        duration_seconds: 9300,
        primary_work_signature: "same-work",
      },
    ]);
    const longRideRow = cellRows.find((row) => row.key === "bike_long_endurance");

    expect(longRideRow?.status).toBe("duplicate-risk");
    expect(longRideRow?.duplicate_risk_template_ids).toEqual(["bike-long-a", "bike-long-b"]);
  });
});
