import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  checkStructure,
  evaluateStructure,
  findStructureIssues,
  writeStructureBaseline,
} from "./structure.mjs";

const fixtures = [];

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { force: true, recursive: true })),
  );
});

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "testing-structure-"));
  fixtures.push(root);
  for (const file of files) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "");
  }
  return root;
}

test("paired implementations require paired platform tests with exact guidance", async () => {
  const root = await fixture([
    "packages/ui/src/components/button/index.web.tsx",
    "packages/ui/src/components/button/index.native.tsx",
    "packages/ui/src/components/button/index.web.test.tsx",
  ]);

  assert.deepEqual(await findStructureIssues(root), [
    {
      id: "ui-component:button:missing-native-test",
      message:
        "packages/ui/src/components/button has paired implementations but is missing packages/ui/src/components/button/index.native.test.tsx.",
      hard: false,
    },
  ]);
});

test("one-sided implementations require the matching marker", async () => {
  const root = await fixture([
    "packages/ui/src/components/table/index.web.tsx",
    "packages/ui/src/components/text/index.native.tsx",
    "packages/ui/src/components/valid/index.web.tsx",
    "packages/ui/src/components/valid/.web-only",
  ]);

  assert.deepEqual(
    (await findStructureIssues(root)).map((entry) => entry.id),
    ["ui-component:table:missing-web-only-marker", "ui-component:text:missing-native-only-marker"],
  );
});

test("contradictory markers always fail while the baseline only ratchets ordinary debt", async () => {
  const root = await fixture([
    "packages/ui/src/components/paired/index.web.tsx",
    "packages/ui/src/components/paired/index.native.tsx",
    "packages/ui/src/components/paired/index.web.test.tsx",
    "packages/ui/src/components/paired/index.native.test.tsx",
    "packages/ui/src/components/paired/.web-only",
    "packages/ui/src/components/legacy/index.web.tsx",
  ]);
  const findings = await findStructureIssues(root);
  const result = evaluateStructure(findings, {
    version: 1,
    findings: ["ui-component:legacy:missing-web-only-marker", "ui-component:gone:old-debt"],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.newFindings, []);
  assert.deepEqual(
    result.hardFindings.map((entry) => entry.id),
    ["ui-component:paired:paired-with-web-only-marker"],
  );
  assert.deepEqual(result.resolvedFindings, ["ui-component:gone:old-debt"]);
});

test("platform markers must be empty regular files", async () => {
  const root = await fixture([
    "packages/ui/src/components/table/index.web.tsx",
    "packages/ui/src/components/table/.web-only",
    "tooling/testing/structure-baseline.json",
  ]);
  await writeFile(path.join(root, "packages/ui/src/components/table/.web-only"), "not empty\n");
  await writeFile(
    path.join(root, "tooling/testing/structure-baseline.json"),
    `${JSON.stringify({ version: 1, findings: [] })}\n`,
  );

  const findings = await findStructureIssues(root);
  assert.deepEqual(findings, [
    {
      id: "ui-component:table:nonempty-web-only-marker",
      message: "packages/ui/src/components/table/.web-only must be an empty regular file.",
      hard: true,
    },
  ]);
  await assert.rejects(writeStructureBaseline(root), /Refusing to baseline contradictory/);
});

test("baseline refresh rejects new debt", async () => {
  const root = await fixture([
    "packages/ui/src/components/table/index.web.tsx",
    "tooling/testing/structure-baseline.json",
  ]);
  const baselinePath = path.join(root, "tooling/testing/structure-baseline.json");
  await writeFile(baselinePath, `${JSON.stringify({ version: 1, findings: [] })}\n`);

  await assert.rejects(
    writeStructureBaseline(root),
    /Refusing to baseline new UI structure debt: ui-component:table:missing-web-only-marker/,
  );
  assert.deepEqual(JSON.parse(await readFile(baselinePath, "utf8")), {
    version: 1,
    findings: [],
  });
});

test("resolved findings fail until baseline refresh and reintroduction becomes new debt", async () => {
  const root = await fixture([
    "packages/ui/src/components/table/index.web.tsx",
    "packages/ui/src/components/table/.web-only",
    "tooling/testing/structure-baseline.json",
  ]);
  const baselinePath = path.join(root, "tooling/testing/structure-baseline.json");
  await writeFile(
    baselinePath,
    `${JSON.stringify({ version: 1, findings: ["ui-component:table:missing-web-only-marker"] })}\n`,
  );

  const staleResult = await checkStructure(root);
  assert.equal(staleResult.ok, false);
  assert.deepEqual(staleResult.resolvedFindings, ["ui-component:table:missing-web-only-marker"]);

  await writeStructureBaseline(root);
  await rm(path.join(root, "packages/ui/src/components/table/.web-only"));
  const reintroducedResult = await checkStructure(root);
  assert.equal(reintroducedResult.ok, false);
  assert.deepEqual(
    reintroducedResult.newFindings.map((entry) => entry.id),
    ["ui-component:table:missing-web-only-marker"],
  );
});

test("baseline writer refuses missing, null, and invalid baseline shapes", async () => {
  const missingRoot = await fixture(["packages/ui/src/components/table/index.web.tsx"]);
  await assert.rejects(
    writeStructureBaseline(missingRoot),
    /Required structure baseline is missing/,
  );

  const invalidRoot = await fixture([
    "packages/ui/src/components/table/index.web.tsx",
    "tooling/testing/structure-baseline.json",
  ]);
  const baselinePath = path.join(invalidRoot, "tooling/testing/structure-baseline.json");
  for (const invalid of [null, { version: 2, findings: [] }, { version: 1, findings: [7] }]) {
    await writeFile(baselinePath, `${JSON.stringify(invalid)}\n`);
    await assert.rejects(writeStructureBaseline(invalidRoot), /Invalid structure baseline shape/);
  }
  await writeFile(baselinePath, "not json\n");
  await assert.rejects(writeStructureBaseline(invalidRoot), /Invalid structure baseline JSON/);
});

test("baseline evaluation treats resolved findings as not ok", () => {
  const result = evaluateStructure([], {
    version: 1,
    findings: ["ui-component:table:missing-web-only-marker"],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.resolvedFindings, ["ui-component:table:missing-web-only-marker"]);
});

test("baseline refresh automatically removes resolved debt", async () => {
  const root = await fixture([
    "packages/ui/src/components/table/index.web.tsx",
    "packages/ui/src/components/table/.web-only",
    "tooling/testing/structure-baseline.json",
  ]);
  const baselinePath = path.join(root, "tooling/testing/structure-baseline.json");
  await writeFile(
    baselinePath,
    `${JSON.stringify({ version: 1, findings: ["ui-component:table:missing-web-only-marker"] })}\n`,
  );

  const baseline = await writeStructureBaseline(root);
  assert.deepEqual(baseline, { version: 1, findings: [] });
});
