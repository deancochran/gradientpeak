import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  allProductJourneyIds,
  journeyCoverageSchema,
  productJourneyRegistry,
} from "@repo/core/testing/journeys";
import { describe, expect, it } from "vitest";

import { mobileJourneyCoverageManifest } from "../lib/testing/journey-coverage";

const mobileRoot = path.resolve(__dirname, "..");
const uiPreviewManifest = JSON.parse(
  readFileSync(
    path.resolve(mobileRoot, "../../packages/ui/src/testing/ui-preview/manifest.generated.json"),
    "utf8",
  ),
) as {
  rootTestId: string;
  scenarios: { selectors: string[]; testId: string }[];
};

function formatList(title: string, items: string[]) {
  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return readSourceTree(entryPath);
      return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")
        ? [readFileSync(entryPath, "utf8")]
        : [];
    })
    .join("\n");
}

type MaestroCommand = {
  name: string;
  source: string;
};

function parseMaestroCommands(source: string): MaestroCommand[] {
  const commandLines = source.split(/\r?\n/);
  const commands: MaestroCommand[] = [];

  for (let index = 0; index < commandLines.length; index += 1) {
    const commandLine = commandLines[index];
    const commandMatch = commandLine?.match(/^- ([A-Za-z][A-Za-z0-9]*):/);
    if (!commandMatch?.[1]) continue;

    const block = [commandLine];
    while (commandLines[index + 1] !== undefined && !commandLines[index + 1]?.startsWith("- ")) {
      index += 1;
      block.push(commandLines[index] ?? "");
    }
    commands.push({ name: commandMatch[1], source: block.join("\n") });
  }

  return commands;
}

function isRuntimeErrorBoundary(command: MaestroCommand) {
  return (
    command.source.includes("assert_runtime_errors_clear.yaml") ||
    command.source.includes("E2E_RUNTIME_ERRORS=0")
  );
}

function isSmokeSetupCommand(command: MaestroCommand) {
  return (
    command.name === "openLink" ||
    /\/(authenticated_home|ensure_signed_out|expo_dev_client_setup)\.yaml/.test(command.source)
  );
}

describe("mobile authoritative journey coverage", () => {
  it("covers every product journey contract", () => {
    const missingJourneys = allProductJourneyIds.filter(
      (journeyId) => !(journeyId in mobileJourneyCoverageManifest),
    );
    const extraJourneys = Object.keys(mobileJourneyCoverageManifest).filter(
      (journeyId) => !(allProductJourneyIds as readonly string[]).includes(journeyId),
    );

    expect(
      [...missingJourneys, ...extraJourneys],
      [
        formatList("Missing mobile journey coverage", missingJourneys),
        formatList("Unknown mobile journey coverage", extraJourneys),
      ].join("\n\n"),
    ).toEqual([]);
  });

  it("keeps coverage manifest entries schema-valid", () => {
    const invalidEntries = Object.entries(mobileJourneyCoverageManifest)
      .filter(([, coverage]) => !journeyCoverageSchema.safeParse(coverage).success)
      .map(([journeyId]) => journeyId);

    expect(invalidEntries).toEqual([]);
  });

  it("provides required selectors for each product journey", () => {
    const missingSelectors = productJourneyRegistry.flatMap((journey) => {
      const coverage = mobileJourneyCoverageManifest[journey.id];
      const selectors = coverage.selectors as Record<string, string | undefined>;

      return journey.requiredSelectorKeys
        .filter((selectorKey) => !selectors[selectorKey])
        .map((selectorKey) => `${journey.id} -> ${selectorKey}`);
    });

    expect(
      missingSelectors,
      formatList("Missing required mobile selectors", missingSelectors),
    ).toEqual([]);
  });

  it("references evidence files that exist in the mobile app", () => {
    const missingEvidenceFiles = Object.entries(mobileJourneyCoverageManifest).flatMap(
      ([journeyId, coverage]) =>
        coverage.evidence
          .filter((evidence) => !existsSync(path.join(mobileRoot, evidence.path)))
          .map((evidence) => `${journeyId} -> ${evidence.path}`),
    );

    expect(
      missingEvidenceFiles,
      formatList("Missing mobile journey evidence files", missingEvidenceFiles),
    ).toEqual([]);
  });

  it("keeps record and import selectors anchored in current runtime source", () => {
    const runtimeSource = ["app", "components"]
      .map((directory) => readSourceTree(path.join(mobileRoot, directory)))
      .join("\n");
    const staleSelectors = (["record.quick_start", "activity.import_fit"] as const).flatMap(
      (journeyId) =>
        Object.values(mobileJourneyCoverageManifest[journeyId].selectors)
          .filter(
            (selector) =>
              !runtimeSource.includes(`testID="${selector}"`) &&
              !runtimeSource.includes(`testId="${selector}"`),
          )
          .map((selector) => `${journeyId} -> ${selector}`),
    );

    expect(staleSelectors, formatList("Stale mobile runtime selectors", staleSelectors)).toEqual(
      [],
    );
  });

  it("keeps unsupported runtime flows declared-only and scaffolded", () => {
    const overstatedFlows = Object.entries(mobileJourneyCoverageManifest).flatMap(
      ([journeyId, coverage]) =>
        coverage.evidence
          .filter(
            (evidence) =>
              evidence.kind === "runtime_flow" &&
              (evidence.path.startsWith(".maestro/flows/main/") ||
                evidence.path.startsWith(".maestro/flows/journeys/")),
          )
          .filter(
            (evidence) =>
              evidence.status !== "scaffold" || evidence.verificationStatus !== "declared",
          )
          .map((evidence) => `${journeyId} -> ${evidence.path}`),
    );

    expect(overstatedFlows).toEqual([]);
  });

  it("maps maintained journeys to syntax-checked smoke flows without claiming runtime execution", () => {
    const maintainedMappings = {
      "auth.sign_in": ".maestro/flows/smoke/auth_navigation.yaml",
      "record.quick_start": ".maestro/flows/smoke/record_lifecycle.yaml",
    } as const;

    for (const [journeyId, flowPath] of Object.entries(maintainedMappings)) {
      const coverage = mobileJourneyCoverageManifest[journeyId as keyof typeof maintainedMappings];
      const runtimeEvidence = coverage.evidence.find((evidence) => evidence.path === flowPath);

      expect(coverage.runtimeVerificationStatus).toBe("syntax_checked");
      expect(runtimeEvidence).toMatchObject({
        kind: "runtime_flow",
        status: "validated",
        verificationStatus: "syntax_checked",
      });
      expect(runtimeEvidence).not.toHaveProperty("execution");
    }
  });

  it("does not claim runtime verification without machine-produced execution metadata", () => {
    const unsupportedClaims = Object.entries(mobileJourneyCoverageManifest).flatMap(
      ([journeyId, coverageInput]) => {
        const coverage = journeyCoverageSchema.parse(coverageInput);

        return [
          ...(coverage.runtimeVerificationStatus === "runtime_verified" &&
          !coverage.evidence.some(
            (evidence) =>
              evidence.kind === "runtime_flow" &&
              evidence.verificationStatus === "runtime_verified" &&
              evidence.execution,
          )
            ? [journeyId]
            : []),
          ...coverage.evidence
            .filter(
              (evidence) =>
                evidence.verificationStatus === "runtime_verified" && !evidence.execution,
            )
            .map((evidence) => `${journeyId} -> ${evidence.path}`),
        ];
      },
    );

    expect(unsupportedClaims).toEqual([]);
  });

  it("keeps maintained smoke and reusable flows portable", () => {
    const maintainedDirectories = ["smoke", "reusable"];
    const nonPortableFlows = maintainedDirectories.flatMap((directory) =>
      readdirSync(path.join(mobileRoot, ".maestro/flows", directory))
        .filter((fileName) => fileName.endsWith(".yaml"))
        .filter((fileName) => {
          const source = readFileSync(
            path.join(mobileRoot, ".maestro/flows", directory, fileName),
            "utf8",
          );
          return !source.startsWith(`appId: \${MAESTRO_APP_ID}\n`);
        })
        .map((fileName) => `${directory}/${fileName}`),
    );

    expect(nonPortableFlows).toEqual([]);
  });

  it("places runtime-error assertions at the first and last effective smoke boundaries", () => {
    const smokeDirectory = path.join(mobileRoot, ".maestro/flows/smoke");
    const weakFlows = readdirSync(smokeDirectory)
      .filter((fileName) => fileName.endsWith(".yaml"))
      .flatMap((fileName) => {
        const source = readFileSync(path.join(smokeDirectory, fileName), "utf8");
        const effectiveCommands = parseMaestroCommands(source).filter(
          (command) => !isSmokeSetupCommand(command),
        );
        const boundaryIndexes = effectiveCommands.flatMap((command, index) =>
          isRuntimeErrorBoundary(command) ? [index] : [],
        );

        return boundaryIndexes.length === 2 &&
          boundaryIndexes[0] === 0 &&
          boundaryIndexes[1] === effectiveCommands.length - 1
          ? []
          : [fileName];
      });
    const beaconHelper = readFileSync(
      path.join(mobileRoot, ".maestro/flows/reusable/assert_runtime_errors_clear.yaml"),
      "utf8",
    );

    expect(weakFlows).toEqual([]);
    expect(beaconHelper).toContain('assertVisible: "E2E_RUNTIME_ERRORS=0"');
    expect(beaconHelper).not.toContain("optional: true");
    expect(beaconHelper).not.toContain("when:");
  });

  it("keeps the UI preview smoke flow aligned with the generated selector contract", () => {
    const previewFlow = readFileSync(
      path.join(mobileRoot, ".maestro/flows/smoke/ui_preview_contract.yaml"),
      "utf8",
    );

    expect(previewFlow).toContain(uiPreviewManifest.rootTestId);
    for (const scenario of uiPreviewManifest.scenarios) {
      expect(previewFlow).toContain(scenario.testId);
    }
    for (const selector of uiPreviewManifest.scenarios.flatMap((scenario) => scenario.selectors)) {
      expect(previewFlow).toContain(selector);
    }
  });
});
