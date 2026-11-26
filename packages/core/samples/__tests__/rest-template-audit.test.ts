import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ActivityPlanStep } from "../../activity-plan";
import { SYSTEM_TEMPLATES } from "..";

// Explicit review decisions, not a name-based migration of saved plans.
const restSteps: Record<string, readonly string[]> = {
  "c457ea7d-780b-4e31-acbf-2592ff6cd946": ["df4c0572-9300-4926-b7e4-34c75aede87b"],
  "4cdf7205-0093-46b9-a477-3daa1784f15e": [
    "0d7ae754-c12e-4b08-b5e2-7e1158ebca5d",
    "17843daa-cb38-415e-bfec-5cef821510a3",
    "95026fdc-49b6-4390-ad9a-b64990230295",
    "0ea1e87b-5aed-44c7-b609-43b069d68ffc",
  ],
  "b5a10000-0001-4000-8001-000000000003": ["52e52cbf-0699-4073-aa7d-4fbc75e20370"],
  "d1a00000-0001-4000-8001-000000000001": ["53c079e6-9f0c-4532-ab58-d063f6891caf"],
  "d1a00000-0002-4000-8001-000000000005": ["e956c330-35a2-4f7c-81ee-92256cff46d9"],
  "d1a00000-0003-4000-8001-000000000009": ["82155cef-36c9-40a3-9aad-3fac65d2f360"],
  "d1a00000-0004-4000-8001-000000000013": ["e0730699-2cbf-42e5-b80b-79e653c0c532"],
  "d1a00000-0005-4000-8001-000000000017": ["aa3d8417-5ef1-48cb-92a5-77e49d0a2b98"],
  "d1a00000-0006-4000-8001-000000000021": ["6afd44d7-1eb1-488b-9265-b724dd4a6bd8"],
  "d1a00000-0007-4000-8001-000000000025": ["77e49d0a-2b98-41be-9f4c-bc4fe2757003"],
  "d1a00000-0008-4000-8001-000000000029": ["fc8f22b5-b043-4669-9427-ad1a87f461ce"],
  "d1a00000-0009-4000-8001-000000000033": ["87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3"],
  "e2a00000-0001-4000-8001-000000000001": [
    "5dca37a4-117e-4b58-8532-8e2168fbda6d",
    "66f940d3-b245-4c1f-be91-6bd891feb724",
  ],
  "e2a00000-0002-4000-8001-000000000005": [
    "9023b649-dc6f-4295-a8bb-e956c33035a2",
    "239049b6-6fdc-4502-bb28-e07306992cbf",
  ],
  "e2a00000-0003-4000-8001-000000000009": [
    "0699e073-52e5-4cbf-9e31-0b78319e57c4",
    "f7641d8a-ab18-413e-9fcc-3ccf62f5f083",
  ],
  "e2a00000-0004-4000-8001-000000000013": [
    "28bb4ee1-7407-4a2d-9023-d13eab181d8a",
    "85f25fcc-39a6-4380-9d8a-66f940d3b245",
  ],
  "e2a00000-0005-4000-8001-000000000017": [
    "2592ff6c-d946-4320-bd2a-0699e07352e5",
    "5aed34c7-0ea1-487b-8255-e7540d7a9b08",
  ],
  "a4e40000-0001-4000-8001-000000000013": ["bc4fe275-7003-4629-94e7-ed5ac734a10e"],
  "e9f5a8b7-2c6d-4e0f-9a4b-6c3d9e8f7a0b": [
    "0699e073-52e5-4cbf-9e31-0b78319e57c4",
    "1b8841ae-67d4-4dfa-83f0-a83bce61f487",
    "58eb7e11-a437-4a5d-8053-c12e9b080d7a",
  ],
  "f0a6b9c8-3d7e-4f1a-ab5c-7d4e0f9a8b1c": [
    "117eeb58-5dca-47a4-b9e6-ca5da4377e11",
    "009326b9-4cdf-4205-982b-990673e0e552",
    "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
  ],
};

describe("reviewed passive rest in the system catalog", () => {
  it("classifies exactly 32 passive-rest steps in 20 templates, keeping all other steps active", () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(68);
    let count = 0;
    for (const template of SYSTEM_TEMPLATES) {
      const actual: string[] = [];
      for (const item of template.structure.items) {
        for (const step of item.type === "repeat" ? item.steps : [item]) {
          if (step.targets.some((target) => target.type === "rest")) {
            expect(step.targets).toEqual([{ type: "rest" }]);
            expect(step.duration.type).toBe("time");
            actual.push(step.id);
            count += 1;
          }
        }
      }
      expect(actual, template.name).toEqual(restSteps[template.id] ?? []);
    }
    expect(count).toBe(32);
    expect(Object.keys(restSteps)).toHaveLength(20);
  });

  it("preserves every step, repeat, duration, instruction and non-rest target from the reviewed baseline", () => {
    // Reviewed baseline includes the subsequent approved strength-rest/RPE and
    // running-recovery coaching revisions and five static swim rest revisions.
    // Also includes the approved track RPE-only work/recovery targets.
    // Track-position revisions add five timed rests and clarify two return cues.
    // Athlete-relative cycling sprints now use RPE 10, with a duration-aware finish cue.
    // Single-line note cleanup removes generated context and shortens twelve cues;
    // all IDs, repeat counts, durations and targets were compared before updating.
    // Only the explicit rest target slots
    // above are omitted; all 68 structures and active prescriptions are covered.
    const payload = SYSTEM_TEMPLATES.map((template) => {
      const omitRestTarget = (step: ActivityPlanStep) =>
        restSteps[template.id]?.includes(step.id) ? { ...step, targets: [] } : step;
      return {
        id: template.id,
        structure: {
          ...template.structure,
          items: template.structure.items.map((item) =>
            item.type === "repeat"
              ? { ...item, steps: item.steps.map(omitRestTarget) }
              : omitRestTarget(item),
          ),
        },
      };
    });
    expect(createHash("sha256").update(JSON.stringify(payload)).digest("hex")).toBe(
      "8eca0a56200242c9fb9748c25b8ef64f2975271486decadaed2b8bf721244477",
    );
  });
});
