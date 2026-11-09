import path from "node:path";

import { getPlatformComponentDirectories } from "../test/filesystem-inventory";
import { NATIVE_STORY_COMPONENTS } from "./story-surface";

describe("native story surface", () => {
  it("covers every native component entrypoint", () => {
    const componentsRoot = path.resolve(process.cwd(), "src/components");
    expect(getPlatformComponentDirectories(componentsRoot, "native")).toEqual(
      [...NATIVE_STORY_COMPONENTS].sort(),
    );
  });
});
