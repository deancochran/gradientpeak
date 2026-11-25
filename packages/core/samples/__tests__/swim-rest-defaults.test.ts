import { describe, expect, it } from "vitest";
import { SYSTEM_TEMPLATES } from "..";
import { EXPANDED_ENDURANCE_SWIM_ACTIVITIES } from "../endurance-expansion-swim";

const defaults = [
  ["Recovery Feel Swim", 15],
  ["Aerobic Continuity Swim", 25],
  ["Tempo Pull Set", 20],
  ["CSS Threshold Swim", 20],
  ["VO2 Pace Swim", 30],
  ["Anaerobic 50s", 70],
  ["Neuromuscular 25s", 85],
  ["Sighting Endurance Swim", 20],
  ["Tempo Negative-Split Swim", 25],
] as const;

describe("static swim recovery defaults", () => {
  it.each(defaults)("keeps authored and effective %s rests at %i seconds", (name, seconds) => {
    for (const templates of [SYSTEM_TEMPLATES, EXPANDED_ENDURANCE_SWIM_ACTIVITIES]) {
      const template = templates.find((candidate) => candidate.name === name);
      expect(template).toBeDefined();
      const repeats = template?.structure.items.filter((item) => item.type === "repeat");
      expect(repeats).toHaveLength(1);
      expect(repeats?.[0]).toMatchObject({ count: 4 });
      expect(repeats?.[0]?.steps[1]).toMatchObject({
        duration: { type: "time", seconds },
        targets: [{ type: "rest" }],
      });
    }
  });

  it("uses positive five-second increments for every passive swim rest, including assessments", () => {
    const swims = SYSTEM_TEMPLATES.filter(
      (template) => template.structure.activity_category === "swim",
    );
    expect(swims).toHaveLength(15);
    let restCount = 0;
    for (const template of swims) {
      for (const item of template.structure.items) {
        for (const step of item.type === "repeat" ? item.steps : [item]) {
          if (!step.targets.some((target) => target.type === "rest")) continue;
          restCount++;
          expect(step.targets).toEqual([{ type: "rest" }]);
          expect(step.duration.type).toBe("time");
          if (step.duration.type === "time") {
            expect(step.duration.seconds).toBeGreaterThan(0);
            expect(step.duration.seconds % 5).toBe(0);
          }
        }
      }
    }
    expect(restCount).toBe(11);
  });
});
