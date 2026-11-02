import { describe, expect, it } from "vitest";

import { getSqlCount, parseCountValue } from "../sql";

describe("parseCountValue", () => {
  it("parses numeric, string, and bigint count values", () => {
    expect(parseCountValue(3)).toBe(3);
    expect(parseCountValue("4")).toBe(4);
    expect(parseCountValue(5n)).toBe(5);
  });

  it("treats missing counts as zero", () => {
    expect(parseCountValue(null)).toBe(0);
    expect(parseCountValue(undefined)).toBe(0);
  });

  it("rejects unsafe or invalid count values", () => {
    expect(() => parseCountValue("1.5")).toThrow("Invalid SQL count value");
    expect(() => parseCountValue(-1)).toThrow("Invalid SQL count value");
    expect(() => parseCountValue(Number.MAX_SAFE_INTEGER + 1)).toThrow("Invalid SQL count value");
  });
});

describe("getSqlCount", () => {
  it("reads count values from a value aliased SQL result", async () => {
    await expect(getSqlCount(Promise.resolve({ rows: [{ value: "7" }] }))).resolves.toBe(7);
  });

  it("returns zero when the result has no value row", async () => {
    await expect(getSqlCount(Promise.resolve({ rows: [] }))).resolves.toBe(0);
  });

  it("rejects malformed count rows without a value alias", async () => {
    await expect(getSqlCount(Promise.resolve({ rows: [{ count: "7" }] }))).rejects.toThrow(
      "SQL count result is missing value alias",
    );
  });
});
