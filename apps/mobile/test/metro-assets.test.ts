import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const expoMetroRequire = createRequire(require.resolve("@expo/metro/package.json"));
const { getAssetData, getAssetSize } = expoMetroRequire("metro/private/Assets") as {
  getAssetData: (
    path: string,
    localPath: string,
    plugins: string[],
    platform: string,
    publicPath: string,
  ) => Promise<{ width: number; height: number; type: string }>;
  getAssetSize: (type: string, content: Buffer, path: string) => unknown;
};

describe("Expo's pinned Metro with the security-fixed image decoder", () => {
  it("reads an ordinary on-disk Expo Router PNG through Metro's real asset path", async () => {
    const path = require.resolve("expo-router/assets/unmatched.png");
    const png = readFileSync(path);
    const asset = await getAssetData(path, "unmatched.png", [], "ios", "/assets");
    // PNG's IHDR dimensions are an independent expectation, not another call
    // to the decoder whose path-vs-buffer compatibility this test protects.
    expect(asset).toMatchObject({
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
      type: "png",
    });
  });

  it("retains non-image and empty-image handling", () => {
    expect(getAssetSize("txt", Buffer.from("not an image"), "fixture.txt")).toBeNull();
    expect(() => getAssetSize("png", Buffer.alloc(0), "empty.png")).toThrow(
      "cannot be an empty file",
    );
  });
});
