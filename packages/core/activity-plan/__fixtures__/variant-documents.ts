import type { ActivityPlanDocumentInput } from "../document-schema";
import type { EditableActivityPlanStructure } from "../structure-schema";

export const fixtureUuid = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const completeRunStructure = (seconds: number): EditableActivityPlanStructure => ({
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: fixtureUuid(1),
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: fixtureUuid(2),
          name: "Main set",
          repetitions: 1,
          steps: [
            {
              id: fixtureUuid(3),
              name: "Steady effort",
              duration: { type: "time", seconds },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
});

const variant = (id: number, name: string, seconds: number) => ({
  id: fixtureUuid(id),
  name,
  structure: completeRunStructure(seconds),
});

export const oneVariantActivityPlanDocumentFixture: ActivityPlanDocumentInput = {
  contractVersion: 1,
  defaultVariantId: fixtureUuid(100),
  variants: [variant(100, "Base", 1_800)],
};

export const twoVariantActivityPlanDocumentFixture: ActivityPlanDocumentInput = {
  contractVersion: 1,
  defaultVariantId: fixtureUuid(100),
  variants: [variant(100, "Base", 1_800), variant(101, "Build", 2_400)],
};

export const fourVariantActivityPlanDocumentFixture: ActivityPlanDocumentInput = {
  contractVersion: 1,
  defaultVariantId: fixtureUuid(102),
  variants: [
    variant(100, "Base", 1_800),
    variant(101, "Build", 2_400),
    variant(102, "Advanced", 3_000),
    variant(103, "Race", 3_600),
  ],
};
