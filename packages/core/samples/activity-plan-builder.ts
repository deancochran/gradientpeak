import type {
  ActivityPlanDuration,
  ActivityPlanStructureV3,
  ActivityPlanTarget,
} from "../activity-plan";
import { deterministicUuidFromSeed } from "../plan/normalizeGoalInput";
import type { CanonicalSport } from "../schemas/sport";

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

/** Template-only builder that authors strict V3 documents with stable nested IDs. */
export class SystemActivityPlanBuilder {
  private readonly intervals: DraftInterval[] = [];

  constructor(
    private readonly category: CanonicalSport,
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
      notes: config.notes,
    });
    return this;
  }

  warmup(config: Omit<StepInput, "name"> & { name?: string }): this {
    return this.step({ ...config, name: config.name ?? "Warmup", intervalName: "Warmup" });
  }

  cooldown(config: Omit<StepInput, "name"> & { name?: string }): this {
    return this.step({ ...config, name: config.name ?? "Cooldown", intervalName: "Cooldown" });
  }

  rest(config: { name?: string; duration: ActivityPlanDuration; notes?: string }): this {
    return this.step({
      name: config.name ?? "Rest",
      duration: config.duration,
      targets: [{ type: "RPE", intensity: 1 }],
      notes: config.notes,
      intervalName: "Rest",
    });
  }

  build(): ActivityPlanStructureV3 {
    if (this.intervals.length === 0) throw new Error("Plan must have at least one interval");

    const segmentSeed = `system-template:${this.category}:${this.identity}`;

    return {
      version: 3,
      segments: [
        {
          id: deterministicUuidFromSeed(`segment:0:${segmentSeed}`),
          name: `${this.category} activity`,
          role: "activity",
          category: this.category,
          intervals: this.intervals.map((interval, intervalIndex) => ({
            id: deterministicUuidFromSeed(`interval:${intervalIndex}:${segmentSeed}`),
            name: interval.name,
            repetitions: interval.repetitions,
            steps: interval.steps.map((step, stepIndex) => ({
              id: deterministicUuidFromSeed(`step:${intervalIndex}:${stepIndex}:${segmentSeed}`),
              name: step.name,
              duration: step.duration,
              targets: step.targets?.length ? step.targets : [{ type: "RPE", intensity: 5 }],
              ...(step.description ? { description: step.description } : {}),
              ...(step.notes ? { notes: step.notes } : {}),
            })),
            ...(interval.notes ? { notes: interval.notes } : {}),
          })),
        },
      ],
    } as ActivityPlanStructureV3;
  }
}

export function createSystemActivityPlanBuilder(category: CanonicalSport, identity: string) {
  return new SystemActivityPlanBuilder(category, identity);
}

/** Binds explicit, ordered identity keys to a source module's authored template definitions. */
export function createSystemActivityPlanBuilderFactory(
  category: CanonicalSport,
  identities: readonly string[],
) {
  let nextIdentityIndex = 0;
  return () => {
    const identity = identities[nextIdentityIndex];
    if (!identity) throw new Error(`Missing stable identity for ${category} system template`);
    nextIdentityIndex += 1;
    return createSystemActivityPlanBuilder(category, identity);
  };
}
