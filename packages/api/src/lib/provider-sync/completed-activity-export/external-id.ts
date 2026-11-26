import { createHmac } from "node:crypto";
import { z } from "zod";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Deterministic identity whose signature binds owner, provider, activity, and immutable bytes. */
export function createCompletedActivityExportExternalId(input: {
  activityId: string;
  artifactDigest: string;
  profileId: string;
  provider: string;
  secret: string;
}): string {
  const activityId = z.string().uuid().parse(input.activityId).toLowerCase();
  const artifactDigest = digestSchema.parse(input.artifactDigest);
  const identity = [
    "completed-activity-export-v1",
    input.provider,
    input.profileId,
    activityId,
    artifactDigest,
  ].join("\0");
  return `gp-v1-${createHmac("sha256", input.secret).update(identity).digest("base64url")}`;
}
