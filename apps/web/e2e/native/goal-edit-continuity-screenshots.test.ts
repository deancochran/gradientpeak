import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { retainGoalEditFlowScreenshots } from "./goal-edit-continuity-screenshots";

const names = ["first", "later"] as const;

function withOwnedDirectory(run: (root: string) => void) {
  const temporaryRoot = join(process.cwd(), ".logs", "tmp");
  mkdirSync(temporaryRoot, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(temporaryRoot, "goal-edit-retention-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("cleans every cwd source when artifact setup fails", () => {
  withOwnedDirectory((root) => {
    const cwd = join(root, "cwd");
    const artifact = join(root, "artifacts");
    const removed: string[] = [];
    mkdirSync(cwd, { recursive: true });
    for (const name of names) writeFileSync(join(cwd, `${name}.png`), name);

    assert.throws(
      () =>
        retainGoalEditFlowScreenshots({
          artifactDirectory: artifact,
          cwdDirectory: cwd,
          debugDirectory: join(root, "debug"),
          names,
          fileOps: {
            chmodSync,
            copyFileSync: () => undefined,
            existsSync,
            mkdirSync: () => {
              throw new Error("artifact setup failed");
            },
            rmSync: (path) => {
              removed.push(path);
              rmSync(path, { force: true });
            },
          },
        }),
      /artifact setup failed/,
    );

    assert.deepEqual(
      removed,
      names.map((name) => join(cwd, `${name}.png`)),
    );
    for (const name of names) assert.equal(existsSync(join(cwd, `${name}.png`)), false);
  });
});

test("cleans later cwd sources when the first copy fails", () => {
  withOwnedDirectory((root) => {
    const cwd = join(root, "cwd");
    const artifact = join(root, "artifacts");
    const removed: string[] = [];
    mkdirSync(cwd, { recursive: true });
    for (const name of names) writeFileSync(join(cwd, `${name}.png`), name);

    assert.throws(
      () =>
        retainGoalEditFlowScreenshots({
          artifactDirectory: artifact,
          cwdDirectory: cwd,
          debugDirectory: join(root, "debug"),
          names,
          fileOps: {
            chmodSync,
            copyFileSync: () => {
              throw new Error("first copy failed");
            },
            existsSync: (path) => path === join(cwd, "first.png"),
            mkdirSync,
            rmSync: (path) => {
              removed.push(path);
              rmSync(path, { force: true });
            },
          },
        }),
      /first copy failed/,
    );

    assert.deepEqual(
      removed,
      names.map((name) => join(cwd, `${name}.png`)),
    );
    for (const name of names) assert.equal(existsSync(join(cwd, `${name}.png`)), false);
  });
});

test("retains a private canonical copy and preserves debug sources", () => {
  withOwnedDirectory((root) => {
    const artifact = join(root, "artifacts");
    const cwd = join(root, "cwd");
    const debug = join(root, "debug");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(debug, { recursive: true });
    writeFileSync(join(cwd, "first.png"), "cwd-first");
    writeFileSync(join(cwd, "later.png"), "cwd-later");
    writeFileSync(join(debug, "first.png"), "debug-first");

    const retained = retainGoalEditFlowScreenshots({
      artifactDirectory: artifact,
      cwdDirectory: cwd,
      debugDirectory: debug,
      names,
    });

    assert.deepEqual(retained, ["first", "later"]);
    assert.equal(readFileSync(join(artifact, "first.png"), "utf8"), "debug-first");
    assert.equal(readFileSync(join(artifact, "later.png"), "utf8"), "cwd-later");
    assert.equal(statSync(artifact).mode & 0o777, 0o700);
    for (const name of names) {
      assert.equal(statSync(join(artifact, `${name}.png`)).mode & 0o777, 0o600);
      assert.equal(existsSync(join(cwd, `${name}.png`)), false);
    }
    assert.equal(existsSync(join(debug, "first.png")), true);
  });
});
