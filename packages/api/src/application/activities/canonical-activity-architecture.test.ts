import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativeUrl: string) {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
}

describe("canonical activity submission architecture", () => {
  it("routes standard and recording creation through submitActivity", () => {
    const router = source("../../routers/activities.ts");
    expect(router).toContain("submitActivity(db");
    expect(router).not.toContain("tx.insert(activities)");
  });

  it("keeps provider adapters free of direct activity projection inserts", () => {
    const importer = source("../../lib/integrations/wahoo/activity-importer.ts");
    const repository = source("../../infrastructure/repositories/drizzle-wahoo-repository.ts");
    expect(importer).not.toContain("createImportedActivity(");
    expect(repository).not.toContain("insert(schema.activities)");
    expect(repository).not.toContain("insert(schema.activityImports)");
  });

  it("routes allowed canonical field mutations through the canonical persistence service", () => {
    const mutations = source("./activity-mutations.ts");
    expect(mutations).toContain("updateCanonicalActivityFields");
    expect(mutations).not.toContain(".update(activities)");
  });
});
