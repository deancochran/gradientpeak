import { describe, expect, it } from "vitest";

import { getWebParityReport } from "./parity-report";

describe("getWebParityReport", () => {
  it("reports the remaining intentionally unavailable browser recording capabilities", () => {
    const report = getWebParityReport();

    expect(report.denominator).toBeGreaterThan(0);
    expect(report.percentage).toBeGreaterThan(0);
    expect(report.percentage).toBeLessThan(100);
    expect(
      report.implemented +
        report.implementedUnverified.length +
        report.partial.length +
        report.missing.length,
    ).toBe(report.denominator);
    expect(report.partial).toEqual([]);
    expect(report.implementedUnverified.length).toBeGreaterThan(0);
    expect(report.missing.map((feature) => feature.id)).toEqual(["record.sensors", "record.ftms"]);
  });
});
