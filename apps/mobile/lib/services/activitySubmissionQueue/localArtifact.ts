import { File } from "expo-file-system";

export async function getLocalActivityArtifactMetadata(filePath: string): Promise<{
  sha256: string;
  byteSize: number;
}> {
  const file = new File(filePath);
  if (!file.exists || !file.size) throw new Error("Activity artifact is missing or empty");
  // Expo crypto initializes native modules at import time. Keep that boundary
  // behind the actual hashing operation so Node-only route tests can import the
  // submission hook without initializing Expo native modules.
  const { CryptoDigestAlgorithm, digest } = await import("expo-crypto");
  const hash = await digest(CryptoDigestAlgorithm.SHA256, await file.bytes());
  const sha256 = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { sha256, byteSize: file.size };
}
