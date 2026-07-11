import fs from "node:fs";
import path from "node:path";

const SURFACES = [
  path.resolve(__dirname, "../../trends/FitnessTab.tsx"),
  path.resolve(__dirname, "../forms/RecoveryRulesForm.tsx"),
  path.resolve(__dirname, "../forms/PeriodizationForm.tsx"),
  path.resolve(__dirname, "../forms/ActivityDistributionForm.tsx"),
  path.resolve(__dirname, "../TrainingPlanNoPlanEmptyState.tsx"),
];

const PROHIBITED_CLAIM_VOCABULARY =
  /\b(?:medical|safety|safe|overtraining|injury|injury-prevention|race-clearance|fitness|fatigue|form)\b/i;

function getUserFacingCopy(source: string): string {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const quotedStrings = [...withoutComments.matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map(
    (match) => match[2],
  );
  const jsxText = [...withoutComments.matchAll(/>([^<>{}]+)</g)].map((match) => match[1]);

  return [...quotedStrings, ...jsxText].join(" ");
}

describe("training model mobile claim language", () => {
  it.each(SURFACES)("keeps prohibited claim vocabulary out of user-facing copy in %s", (file) => {
    const copy = getUserFacingCopy(fs.readFileSync(file, "utf8"));

    expect(copy).not.toMatch(PROHIBITED_CLAIM_VOCABULARY);
  });
});
