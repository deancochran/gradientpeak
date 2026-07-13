import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DB and Core enum parity manifest", () => {
  it("keeps mapped persistence and domain values aligned", () => {
    const root = resolve(import.meta.dirname, "../..");
    const output = execFileSync(
      "node",
      ["tooling/architecture/check-architecture.mjs", "--skip-freshness"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );

    expect(output).toContain("new violations: 0");
  });
});
