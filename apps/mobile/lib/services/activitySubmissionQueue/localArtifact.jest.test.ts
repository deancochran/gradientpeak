const digest = jest.fn(async () => Uint8Array.from([0, 15, 255]).buffer);

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digest,
}));

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    exists = true;
    size = 3;
    async bytes() {
      return Uint8Array.from([1, 2, 3]);
    }
  },
}));

import { getLocalActivityArtifactMetadata } from "./localArtifact";

describe("getLocalActivityArtifactMetadata", () => {
  it("loads native crypto at hashing time and returns the required SHA-256 digest", async () => {
    await expect(getLocalActivityArtifactMetadata("file:///activity.fit")).resolves.toEqual({
      sha256: "000fff",
      byteSize: 3,
    });
    expect(digest).toHaveBeenCalledWith("SHA256", Uint8Array.from([1, 2, 3]));
  });
});
