import path from "node:path";
import { describe, expect, it } from "vitest";

import { getPlatformComponentDirectories } from "../test/filesystem-inventory";
import { WEB_STORY_COMPONENTS } from "./story-surface";

describe("web story surface", () => {
  it("covers every web component entrypoint", () => {
    const componentsRoot = path.resolve(process.cwd(), "src/components");
    expect(getPlatformComponentDirectories(componentsRoot, "web")).toEqual(
      [...WEB_STORY_COMPONENTS].sort(),
    );
  });
});
