import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { uiPreviewContract, uiPreviewFormFields } from "../src/testing/ui-preview/contract.ts";

function compactSelectors(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const selectorsPath = path.resolve(__dirname, "../src/testing/selectors.generated.json");
const outputPath = path.resolve(__dirname, "../src/testing/ui-preview/manifest.generated.json");

const selectors = JSON.parse(await readFile(selectorsPath, "utf8")) as Record<string, any>;

const uiPreviewManifest = {
  description: uiPreviewContract.description,
  rootTestId: uiPreviewContract.rootTestId,
  scenarios: [
    {
      description: uiPreviewContract.scenarios.accountControls.description,
      key: "accountControls",
      selectors: compactSelectors([
        selectors.card?.profile?.testId,
        selectors.input?.email?.testId,
        selectors.button?.save?.testId,
      ]),
      testId: uiPreviewContract.scenarios.accountControls.testId,
      title: uiPreviewContract.scenarios.accountControls.title,
    },
    {
      description: uiPreviewContract.scenarios.planTabs.description,
      key: "planTabs",
      selectors: compactSelectors([
        selectors.tabs?.settings?.rootTestId,
        selectors.tabs?.settings?.triggers?.overview?.testId,
        selectors.tabs?.settings?.triggers?.sessions?.testId,
        selectors.tabs?.settings?.contentTestIds?.overview,
      ]),
      testId: uiPreviewContract.scenarios.planTabs.testId,
      title: uiPreviewContract.scenarios.planTabs.title,
    },
    {
      description: uiPreviewContract.scenarios.feedbackStates.description,
      key: "feedbackStates",
      selectors: [],
      testId: uiPreviewContract.scenarios.feedbackStates.testId,
      title: uiPreviewContract.scenarios.feedbackStates.title,
    },
    {
      description: uiPreviewContract.scenarios.formFields.description,
      key: "formFields",
      selectors: [
        uiPreviewFormFields.usernameTestId,
        uiPreviewFormFields.bioTestId,
        uiPreviewFormFields.isPublicTestId,
        uiPreviewFormFields.sportTestId,
        uiPreviewFormFields.submitButtonTestId,
      ],
      testId: uiPreviewContract.scenarios.formFields.testId,
      title: uiPreviewContract.scenarios.formFields.title,
    },
    {
      description: uiPreviewContract.scenarios.selectionControls.description,
      key: "selectionControls",
      selectors: compactSelectors([
        selectors.checkbox?.terms?.testId,
        selectors.switch?.notifications?.testId,
        selectors.select?.workoutType?.testId,
        selectors["radio-group"]?.sport?.testId,
      ]),
      testId: uiPreviewContract.scenarios.selectionControls.testId,
      title: uiPreviewContract.scenarios.selectionControls.title,
    },
  ],
} as const;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(uiPreviewManifest, null, 2)}\n`, "utf8");

console.log(`Wrote UI preview manifest to ${outputPath}`);
