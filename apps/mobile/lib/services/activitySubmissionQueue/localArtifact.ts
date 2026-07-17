import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { File } from "expo-file-system";

export async function getLocalActivityArtifactMetadata(filePath: string): Promise<{
  sha256: string;
  byteSize: number;
}> {
  const file = new File(filePath);
  if (!file.exists || !file.size) throw new Error("Activity artifact is missing or empty");
  const hash = await digest(CryptoDigestAlgorithm.SHA256, await file.bytes());
  const sha256 = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { sha256, byteSize: file.size };
}
