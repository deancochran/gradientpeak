import { describe, expect, it } from "vitest";
import { activityPlanAuthoringStructureSchema } from "../../activity-plan";
import { SYSTEM_TEMPLATES } from "..";
import { catalogStepNote } from "../step-note-policy";

describe("system template step-note policy", () => {
  it.each(SYSTEM_TEMPLATES)("keeps $name authorable with short single-line cues", (template) => {
    expect(activityPlanAuthoringStructureSchema.safeParse(template.structure).success).toBe(true);
    for (const item of template.structure.items) {
      for (const step of item.type === "repeat" ? item.steps : [item]) {
        if (!step.instructions) continue;
        expect(step.instructions).not.toMatch(/[\r\n\u0085\u2028\u2029]/u);
        expect(step.instructions).not.toMatch(/^(?:Context|Repeat context|Block context|Notes):/u);
        expect(Array.from(step.instructions).length).toBeLessThanOrEqual(160);
      }
    }
  });
  it("retains FTP measurement details in the description instead of the step note", () => {
    const template = SYSTEM_TEMPLATES.find(
      (candidate) => candidate.name === "Cycling FTP Assessment",
    );
    expect(template?.description).toContain("At exactly 30:00");
    expect(template?.description).toContain("including zeros");
    expect(template?.description).toContain(
      "do not use normalized power or include warm-up/cool-down",
    );
  });
  it("removes known generated metadata without truncating unknown long instructions", () => {
    expect(catalogStepNote("Notes:\nStay relaxed.\n\nContext: Warmup")).toBe("Stay relaxed.");
    expect(catalogStepNote("Context: Warmup")).toBeUndefined();
    expect(() => catalogStepNote("a".repeat(161))).toThrow();
  });
});
