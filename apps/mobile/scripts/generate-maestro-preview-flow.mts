import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SelectorManifest = {
  button?: {
    save?: { testId?: string };
  };
  card?: {
    profile?: { testId?: string };
  };
  input?: {
    email?: { testId?: string };
  };
  tabs?: {
    settings?: { rootTestId?: string };
  };
};

type UiPreviewManifest = {
  rootTestId: string;
  scenarios: Array<{
    selectors: string[];
    testId: string;
  }>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const selectorsPath = path.resolve(
  __dirname,
  "../../../packages/ui/src/testing/selectors.generated.json",
);
const previewManifestPath = path.resolve(
  __dirname,
  "../../../packages/ui/src/testing/ui-preview/manifest.generated.json",
);
const outputPath = path.resolve(__dirname, "../.maestro/flows/main/ui_preview.yaml");

const selectors = JSON.parse(await readFile(selectorsPath, "utf8")) as SelectorManifest;
const previewManifest = JSON.parse(
  await readFile(previewManifestPath, "utf8"),
) as UiPreviewManifest;

const profileCardId = selectors.card?.profile?.testId;
const emailInputId = selectors.input?.email?.testId;
const saveButtonId = selectors.button?.save?.testId;

if (!profileCardId || !emailInputId || !saveButtonId) {
  throw new Error(
    "Missing required preview selector ids in packages/ui/src/testing/selectors.generated.json",
  );
}

const previewAssertions = [
  `- assertVisible:\n    id: "${previewManifest.rootTestId}"`,
  `- assertVisible:\n    id: "${profileCardId}"`,
  `- assertVisible:\n    id: "${emailInputId}"`,
  `- assertVisible:\n    id: "${saveButtonId}"`,
  ...previewManifest.scenarios.map((scenario, index) => {
    const steps: string[] = [];

    if (index > 0) {
      steps.push(`- swipe:\n    direction: UP`);
      steps.push(`- swipe:\n    direction: UP`);
      steps.push(`- swipe:\n    direction: UP`);
    }

    steps.push(`- assertVisible:\n    id: "${scenario.testId}"`);

    return steps.join("\n");
  }),
].join("\n");

const yaml = `# Generated from packages/ui/src/testing/selectors.generated.json. Do not edit manually.
appId: com.deancochran.gradientpeak.dev
---
- runFlow:
    file: ../reusable/bootstrap.yaml
- assertVisible:
    id: "sign-in-screen"
- tapOn:
    id: "open-ui-preview-button"
${previewAssertions}
- takeScreenshot: reports/ui_preview_screen.png
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, yaml, "utf8");

console.log(`Wrote Maestro preview flow to ${outputPath}`);
