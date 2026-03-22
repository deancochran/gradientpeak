import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { WEB_STORY_COMPONENTS } from "./story-surface";

function getComponentDirectories(entryFileName: string) {
  const componentsRoot = path.resolve(process.cwd(), "src/components");

  return readdirSync(componentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((entry) => existsSync(path.join(componentsRoot, entry, entryFileName)))
    .sort();
}

describe("web story surface", () => {
  it("covers every web component entrypoint", () => {
    expect(getComponentDirectories("index.web.tsx")).toEqual([...WEB_STORY_COMPONENTS].sort());
  });
});
