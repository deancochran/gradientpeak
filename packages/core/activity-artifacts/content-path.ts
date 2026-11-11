const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Canonical immutable activity-artifact object name shared by runtime and cutover tooling. */
export function activityArtifactContentPath(profileId: string, sha256: string): string {
  if (!profileId || !SHA256_HEX.test(sha256)) {
    throw new Error(
      "Activity artifact content paths require a profile and lowercase SHA-256 digest",
    );
  }
  return `artifacts/sha256/${profileId}/${sha256}`;
}
