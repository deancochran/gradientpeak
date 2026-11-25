import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("social and feed router persistence boundaries", () => {
  it.each(["../social.ts", "../feed.ts"])("keeps direct persistence out of %s", (relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

    expect(source).not.toMatch(/\b(?:db|tx)\.(?:execute|select|insert|update|delete)\b/);
    expect(source).not.toContain("drizzle-orm");
  });

  it.each([
    "../../application/feed/readFeed.ts",
    "../../application/social/contentEngagement.ts",
    "../../application/social/followMutations.ts",
    "../../application/social/searchUsers.ts",
    "../../application/social/socialGraph.ts",
  ])("keeps persistence primitives out of %s", (relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

    expect(source).not.toMatch(/\b(?:db|tx)\.(?:execute|query|select|insert|update|delete)\b/);
    expect(source).not.toContain("drizzle-orm");
    expect(source).not.toMatch(/\bsql(?:<[^>]+>)?`/);
  });
});
