const rfc4122UuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireRfc4122Uuid(value: string, label: string): string {
  if (!rfc4122UuidPattern.test(value)) {
    throw new Error(`${label} must be an RFC 4122 UUID`);
  }

  return value;
}

export function normalizeSystemActivityTemplateId({
  id,
  activityCategory: _activityCategory,
  name: _name,
}: {
  id: string;
  activityCategory: string;
  name: string;
}): string {
  return requireRfc4122Uuid(id, "System activity template ID");
}

export function normalizeLinkedActivityPlanId(activityPlanId: string): string {
  return requireRfc4122Uuid(activityPlanId, "Linked activity plan ID");
}

export function normalizeSystemRouteTemplateId({
  id,
  name: _name,
}: {
  id: string;
  name: string;
}): string {
  return requireRfc4122Uuid(id, "System route template ID");
}
