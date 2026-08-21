import { activityPlanStructureSchema } from "@repo/core/activity-plan";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayId(ordinal: number): string {
  return `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}`;
}

/**
 * Public shares deliberately omit authored document IDs. The existing display
 * components still need stable React keys and Core's validated render model,
 * so create throwaway IDs locally after retaining only display fields.
 */
export function toRenderableActivityPlanStructure(input: unknown): unknown {
  const canonical = activityPlanStructureSchema.safeParse(input);
  if (canonical.success) return canonical.data;
  if (!isRecord(input) || input.version !== 3 || !Array.isArray(input.segments)) return null;

  let ordinal = 1;
  const nextId = () => displayId(ordinal++);
  const segments = input.segments.map((segment) => {
    if (!isRecord(segment) || typeof segment.name !== "string") return null;
    const notes = typeof segment.notes === "string" ? { notes: segment.notes } : {};

    if (segment.role === "rest" && isRecord(segment.duration)) {
      return {
        id: nextId(),
        name: segment.name,
        role: "rest" as const,
        ...notes,
        duration: segment.duration,
      };
    }
    if (segment.role !== "activity" || !Array.isArray(segment.intervals)) return null;

    const intervals = segment.intervals.map((interval) => {
      if (
        !isRecord(interval) ||
        typeof interval.name !== "string" ||
        !Number.isInteger(interval.repetitions) ||
        !Array.isArray(interval.steps)
      ) {
        return null;
      }
      const intervalNotes = typeof interval.notes === "string" ? { notes: interval.notes } : {};
      const steps = interval.steps.map((step) => {
        if (
          !isRecord(step) ||
          typeof step.name !== "string" ||
          !isRecord(step.duration) ||
          !Array.isArray(step.targets)
        ) {
          return null;
        }
        return {
          id: nextId(),
          name: step.name,
          ...(typeof step.description === "string" ? { description: step.description } : {}),
          ...(typeof step.notes === "string" ? { notes: step.notes } : {}),
          duration: step.duration,
          targets: step.targets,
        };
      });
      return steps.some((step) => step === null)
        ? null
        : {
            id: nextId(),
            name: interval.name,
            repetitions: interval.repetitions,
            ...intervalNotes,
            steps,
          };
    });
    return intervals.some((interval) => interval === null)
      ? null
      : { id: nextId(), name: segment.name, role: "activity" as const, ...notes, intervals };
  });

  if (segments.some((segment) => segment === null)) return null;
  return (
    activityPlanStructureSchema.safeParse({
      version: input.version,
      activity_category: input.activity_category,
      segments,
    }).data ?? null
  );
}
