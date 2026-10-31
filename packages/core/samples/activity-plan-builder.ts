import type {
  ActivityPlanDuration,
  ActivityPlanItem,
  ActivityPlanStructure,
  ActivityPlanTarget,
} from "../activity-plan";
import { activityPlanStructureSchema } from "../activity-plan";
import { deterministicUuidFromSeed } from "../plan/normalizeGoalInput";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { catalogStepNote } from "./step-note-policy";

type StepInput = {
  name: string;
  duration: ActivityPlanDuration;
  targets?: ActivityPlanTarget[];
  notes?: string;
  description?: string;
};

type DraftInterval = {
  name: string;
  repetitions: number;
  steps: StepInput[];
  notes?: string;
};

export function requiredSampleItem<T>(values: readonly T[], index: number, context: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing ${context} at index ${index}.`);
  return value;
}

/** Template-only builder for fixed V5 documents with stable item and step IDs. */
export class SystemActivityPlanBuilder {
  private readonly intervals: DraftInterval[] = [];

  constructor(
    private readonly activity_category: CanonicalActivityCategory,
    private readonly identity: string,
  ) {}

  step(config: StepInput & { intervalName?: string }): this {
    this.intervals.push({
      name: config.intervalName ?? config.name,
      repetitions: 1,
      steps: [config],
    });
    return this;
  }

  interval(config: { repeat: number; name?: string; steps: StepInput[]; notes?: string }): this {
    this.intervals.push({
      name: config.name ?? `Interval ${this.intervals.length + 1}`,
      repetitions: config.repeat,
      steps: config.steps,
      ...(config.notes === undefined ? {} : { notes: config.notes }),
    });
    return this;
  }

  warmup(config: Omit<StepInput, "name"> & { name?: string }): this {
    return this.step({
      ...config,
      name: config.name ?? "Warmup",
      intervalName: "Warmup",
    });
  }

  cooldown(config: Omit<StepInput, "name"> & { name?: string }): this {
    return this.step({
      ...config,
      name: config.name ?? "Cooldown",
      intervalName: "Cooldown",
    });
  }

  rest(config: { name?: string; duration: ActivityPlanDuration; notes?: string }): this {
    return this.step({
      name: config.name ?? "Rest",
      duration: config.duration,
      targets: [{ type: "rest" }],
      ...(config.notes === undefined ? {} : { notes: config.notes }),
      intervalName: "Rest",
    });
  }

  build(): ActivityPlanStructure {
    if (this.intervals.length === 0) throw new Error("Plan must have at least one item");

    const segmentSeed = `system-template:${this.activity_category}:${this.identity}`;
    return activityPlanStructureSchema.parse({
      version: 5,
      activity_category: this.activity_category,
      items: this.intervals.flatMap((interval, intervalIndex): ActivityPlanItem[] => {
        const context = [interval.name, interval.notes]
          .filter((value): value is string => Boolean(value?.trim()))
          .filter((value, index, values) => values.indexOf(value) === index)
          .join("\n\n");
        const contextLabel = interval.repetitions > 1 ? "Repeat context" : "Context";
        const steps = interval.steps.map((step, stepIndex) => {
          const childInstructions = [step.description, step.notes]
            .filter((value): value is string => Boolean(value?.trim()))
            .filter((value, index, values) => values.indexOf(value) === index)
            .join("\n\n");
          const instructions = catalogStepNote(
            [
              childInstructions,
              stepIndex === 0 && context && !childInstructions.includes(context)
                ? `${contextLabel}: ${context}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
          return {
            type: "step" as const,
            id: deterministicUuidFromSeed(`step:${intervalIndex}:${stepIndex}:${segmentSeed}`),
            name: step.name,
            duration: step.duration,
            targets: step.targets ?? [{ type: "RPE", intensity: 5 }],
            ...(instructions ? { instructions } : {}),
          };
        });
        if (interval.repetitions === 1) return steps;
        return [
          {
            type: "repeat" as const,
            id: deterministicUuidFromSeed(`repeat:${intervalIndex}:${segmentSeed}`),
            count: interval.repetitions,
            steps,
          },
        ];
      }),
    });
  }
}

export function createSystemActivityPlanBuilder(
  activity_category: CanonicalActivityCategory,
  identity: string,
) {
  return new SystemActivityPlanBuilder(activity_category, identity);
}

/** Binds explicit, ordered identity keys to a source module's authored template definitions. */
export function createSystemActivityPlanBuilderFactory(
  activity_category: CanonicalActivityCategory,
  identities: readonly string[],
) {
  let nextIdentityIndex = 0;
  return () => {
    const identity = identities[nextIdentityIndex];
    if (!identity)
      throw new Error(`Missing stable identity for ${activity_category} system template`);
    nextIdentityIndex += 1;
    return createSystemActivityPlanBuilder(activity_category, identity);
  };
}
