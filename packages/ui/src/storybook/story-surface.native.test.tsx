import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { NATIVE_STORY_COMPONENTS } from "./story-surface";

function getComponentDirectories(entryFileName: string) {
  const componentsRoot = path.resolve(process.cwd(), "src/components");

  return readdirSync(componentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((entry) => existsSync(path.join(componentsRoot, entry, entryFileName)))
    .sort();
}

describe("native story surface", () => {
  it("covers every native component entrypoint", () => {
    expect(getComponentDirectories("index.native.tsx")).toEqual(
      [...NATIVE_STORY_COMPONENTS].sort(),
    );
  });
});
