import { z } from "zod";
import { getApiStorageService } from "../../storage-service";

const PROFILE_MEDIA_BUCKET = "profile-avatars";
const publicUrlSchema = z.string().url();

function isOwnedProfileMediaPath(value: string, profileId: string) {
  const segments = value.split("/");
  return (
    segments[0] === profileId &&
    segments.length >= 2 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("\\") &&
        !segment.includes("%"),
    )
  );
}

/**
 * Preserve canonical remote URLs and upgrade legacy owned storage paths for API consumers.
 */
export function resolveProfileMediaUrl(value: string | null, profileId: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    if (!isOwnedProfileMediaPath(value, profileId)) return null;
  }

  const publicUrl = getApiStorageService().storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(value)
    .data.publicUrl;
  return publicUrlSchema.parse(publicUrl);
}
