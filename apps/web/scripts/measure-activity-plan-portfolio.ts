import {
  ACTIVITY_PLAN_PORTFOLIO_MAX_SIZE,
  EXPANDED_ENDURANCE_BIKE_METADATA,
  EXPANDED_ENDURANCE_OTHER_METADATA,
  EXPANDED_ENDURANCE_RUN_METADATA,
  EXPANDED_ENDURANCE_STRENGTH_METADATA,
  EXPANDED_ENDURANCE_SWIM_METADATA,
  evaluateActivityPlanPortfolio,
  ICONIC_ENDURANCE_METADATA,
  SYSTEM_TEMPLATES,
} from "@repo/core";

const report = evaluateActivityPlanPortfolio(SYSTEM_TEMPLATES, [
  ...EXPANDED_ENDURANCE_BIKE_METADATA,
  ...EXPANDED_ENDURANCE_OTHER_METADATA,
  ...EXPANDED_ENDURANCE_RUN_METADATA,
  ...EXPANDED_ENDURANCE_STRENGTH_METADATA,
  ...EXPANDED_ENDURANCE_SWIM_METADATA,
  ...ICONIC_ENDURANCE_METADATA,
]);
console.log(JSON.stringify(report, null, 2));

if (report.size > ACTIVITY_PLAN_PORTFOLIO_MAX_SIZE) {
  throw new Error(
    `Activity-plan portfolio exceeds the ${ACTIVITY_PLAN_PORTFOLIO_MAX_SIZE}-plan cap`,
  );
}
if (report.validStructureCount !== report.size) {
  throw new Error("Activity-plan portfolio contains an invalid structure");
}
if (report.duplicateIds.length > 0) {
  throw new Error(
    `Activity-plan portfolio contains duplicate IDs: ${report.duplicateIds.join(", ")}`,
  );
}
if (report.duplicateNames.length > 0) {
  throw new Error(
    `Activity-plan portfolio contains duplicate names: ${report.duplicateNames.join(", ")}`,
  );
}
if (report.exactSemanticDuplicates.length > 0) {
  throw new Error(
    `Activity-plan portfolio contains exact semantic duplicates: ${JSON.stringify(report.exactSemanticDuplicates)}`,
  );
}
if (report.metadataMismatches.length > 0) {
  throw new Error(
    `Activity-plan portfolio contains metadata mismatches: ${report.metadataMismatches.join(", ")}`,
  );
}
if (report.progressionScore < 1) {
  throw new Error(`Activity-plan portfolio progression score is ${report.progressionScore}`);
}
