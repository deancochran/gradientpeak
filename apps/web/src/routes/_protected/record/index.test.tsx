import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("recording launcher import handoff", () => {
  it("uses the canonical importer with recording provenance", () => {
    const source = readFileSync("src/routes/_protected/record/index.tsx", "utf8");

    expect(source).toContain('to="/activities/import"');
    expect(source).toContain('search={{ ...search, from: "record" }}');
  });
});
