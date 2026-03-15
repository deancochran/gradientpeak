import { deterministicUuidFromSeed } from "../plan/normalizeGoalInput";

const uuidLikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rfc4122UuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalizeLegacyUuid(value: string): string {
  const compact = value.replace(/-/g, "").toLowerCase();
  const bytes = new Uint8Array(16);

  for (let index = 0; index < 16; index += 1) {
    const byteHex = compact.slice(index * 2, index * 2 + 2);
    bytes[index] = Number.parseInt(byteHex, 16);
  }

  const byte6 = bytes[6] ?? 0;
  const byte8 = bytes[8] ?? 0;
  bytes[6] = (byte6 & 0x0f) | 0x40;
  bytes[8] = (byte8 & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function slugifySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSystemActivityTemplateId({
  id,
  activityCategory,
  name,
}: {
  id?: string;
  activityCategory: string;
  name: string;
}): string {
  if (id && rfc4122UuidPattern.test(id)) {
    return id;
  }

  if (id && uuidLikePattern.test(id)) {
    return canonicalizeLegacyUuid(id);
  }

  return deterministicUuidFromSeed(
    `system-activity-template:${slugifySegment(activityCategory)}:${slugifySegment(name)}`,
  );
}

export function normalizeLinkedActivityPlanId(activityPlanId: string): string {
  if (rfc4122UuidPattern.test(activityPlanId)) {
    return activityPlanId;
  }

  if (uuidLikePattern.test(activityPlanId)) {
    return canonicalizeLegacyUuid(activityPlanId);
  }

  return deterministicUuidFromSeed(
    `system-activity-template:external:${activityPlanId}`,
  );
}
