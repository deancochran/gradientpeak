function humanizeRole(value: string | null | undefined) {
  return String(value ?? "unknown").replaceAll("_", " ");
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function segmentDurationLabel(segment: Record<string, unknown>) {
  const duration = segment.duration;
  if (!duration || typeof duration !== "object") return null;
  const seconds = (duration as Record<string, unknown>).seconds;
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? `${Math.round(seconds / 60)} min`
    : null;
}

export type ActivityPlanSegmentSummary = {
  key: string;
  label: string;
  role: string;
};

export function summarizeActivityPlanSegments(structure: unknown): ActivityPlanSegmentSummary[] {
  if (!structure || typeof structure !== "object") return [];
  const segments = (structure as Record<string, unknown>).segments;
  if (!Array.isArray(segments)) return [];

  return segments.map((segment, index) => {
    const record =
      segment && typeof segment === "object" ? (segment as Record<string, unknown>) : {};
    const role = typeof record.role === "string" ? record.role : "unknown";
    const category = typeof record.category === "string" ? record.category : null;
    const label = role === "activity" && category ? category : humanizeRole(role);
    const durationLabel = segmentDurationLabel(record);

    return {
      key: typeof record.id === "string" ? record.id : `${role}-${index}`,
      label: durationLabel ? `${titleCase(label)} · ${durationLabel}` : titleCase(label),
      role,
    };
  });
}

export function describeActivityPlanSegments(structure: unknown) {
  const summaries = summarizeActivityPlanSegments(structure);
  return summaries.length > 0
    ? summaries.map((summary) => summary.label).join(" → ")
    : "Structured workout details";
}

export function describeTrainingPlanSessions(structure: unknown) {
  if (!structure || typeof structure !== "object") return "No sessions specified";
  const sessions = collectTrainingPlanSessions(structure);
  if (sessions.length === 0) return "No sessions specified";

  return `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
}

function collectTrainingPlanSessions(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const ownSessions = Array.isArray(record.sessions) ? record.sessions : [];
  const blockSessions = Array.isArray(record.blocks)
    ? record.blocks.flatMap((block) => collectTrainingPlanSessions(block))
    : [];
  return [...ownSessions, ...blockSessions];
}
