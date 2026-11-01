import { pathToFileURL } from "node:url";

export const validationJobs = ["quality-and-build", "api-live-db", "mobile-component-and-jest"];

export function validationFailures(needs) {
  if (needs.changes?.result !== "success") return ["changes"];
  const docsOnly = needs.changes.outputs?.docs_only;
  if (docsOnly !== "true" && docsOnly !== "false") return ["changes.outputs.docs_only"];
  const required = docsOnly === "true" ? ["docs-only"] : validationJobs;
  return required.filter((job) => needs[job]?.result !== "success");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = validationFailures(JSON.parse(process.env.VALIDATION_NEEDS ?? "{}"));
  if (failures.length) {
    console.error(`Required validation did not succeed: ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("All required validation jobs passed.");
  }
}
