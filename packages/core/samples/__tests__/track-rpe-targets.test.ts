import { describe, expect, it } from "vitest";
import { activityPlanAuthoringStructureSchema } from "../../activity-plan";
import { SYSTEM_TEMPLATES } from "..";
import * as authored from "../outdoor-run";

const tracks = SYSTEM_TEMPLATES.filter((template) => template.name.startsWith("Track "));
describe("track RPE targets", () => {
  it("covers all six track activity plans", () => expect(tracks).toHaveLength(6));
  it.each(tracks)("validates and synchronizes $name", (template) => {
    expect(activityPlanAuthoringStructureSchema.safeParse(template.structure).success).toBe(true);
    const source = Object.values(authored)
      .flatMap((candidate) => (Array.isArray(candidate) ? candidate : [candidate]))
      .find((candidate) => candidate.id === template.id);
    expect(source).toBeDefined();
    const steps = template.structure.items.flatMap((item) =>
      item.type === "repeat" ? item.steps : [item],
    );
    const sourceSteps = source?.structure.items.flatMap((item) =>
      item.type === "repeat" ? item.steps : [item],
    );
    expect(steps.map(({ name, duration, targets }) => ({ name, duration, targets }))).toEqual(
      sourceSteps?.map(({ name, duration, targets }) => ({ name, duration, targets })),
    );
    for (const step of steps) {
      if (step.name === "Rest") {
        expect(step.targets).toEqual([{ type: "rest" }]);
        expect(step.duration).toEqual({
          type: "time",
          seconds: template.name === "Track 400m Repeats" ? 60 : 90,
        });
      }
      if (step.name?.startsWith("Recovery") || step.name === "Walk Recovery") {
        expect(step.targets).toEqual([{ type: "RPE", intensity: 2 }]);
        expect(step.duration.type).toBe("distance");
      }
      if (step.name === "800m Repeat" || step.name === "1600m Repeat") {
        expect(step.targets).toEqual([{ type: "RPE", intensity: 8 }]);
      }
    }
  });

  it.each(tracks)("returns every work rep to the same start in $name", (template) => {
    let position = 0;
    let workCount = 0;
    for (const item of template.structure.items) {
      const count = item.type === "repeat" ? item.count : 1;
      for (let occurrence = 0; occurrence < count; occurrence++) {
        for (const step of item.type === "repeat" ? item.steps : [item]) {
          if (step.duration.type !== "distance") continue;
          const recovery = step.name?.startsWith("Recovery") || step.name === "Walk Recovery";
          if (!recovery && step.name !== "Warmup" && step.name !== "Cooldown") {
            expect(position, `${template.name}: ${step.name}`).toBe(0);
            workCount++;
          }
          // Strides use an explicitly instructed walk-back outside active lanes,
          // rather than continuing forwards around the oval.
          const direction = step.name === "Walk Recovery" ? -1 : 1;
          if (direction === -1) {
            expect(step.instructions).toContain("Walk back to the starting line");
            expect(step.instructions).toContain("never reverse against track traffic");
          }
          position = (position + direction * step.duration.meters + 400) % 400;
        }
      }
    }
    expect(workCount).toBeGreaterThan(0);
  });

  it("preserves the ladder's two full-lap recovery jogs and four timed rests", () => {
    const ladder = tracks.find((template) => template.name === "Track Ladder Activity");
    const steps = ladder?.structure.items.flatMap((item) =>
      item.type === "repeat" ? item.steps : [item],
    );
    expect(steps?.filter((step) => step.name === "Recovery 400m")).toHaveLength(2);
    expect(steps?.filter((step) => step.name === "Rest")).toHaveLength(4);
  });
});
