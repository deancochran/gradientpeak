#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { syncBaselineMirror } from "./sync-baseline-mirror";

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "gradientpeak-baseline-mirror-"));
const authority = resolve(fixtureRoot, "authority");
const mirror = resolve(fixtureRoot, "mirror");
const outside = resolve(fixtureRoot, "outside.sql");

function snapshot(directory: string) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => {
      const path = resolve(directory, entry.name);
      const contents = readFileSync(path);
      return {
        contents: contents.toString("hex"),
        mtimeMs: lstatSync(path).mtimeMs,
        name: entry.name,
        sha256: createHash("sha256").update(contents).digest("hex"),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function contentsAndHashes(files: ReturnType<typeof snapshot>) {
  return files.map(({ mtimeMs: _mtimeMs, ...file }) => file);
}

try {
  mkdirSync(authority);
  mkdirSync(mirror);
  const baseline = {
    version: "20260101000000",
    name: "baseline",
    sha256: createHash("sha256").update("select 1;\n").digest("hex"),
  };
  writeFileSync(resolve(authority, "20260101000000_baseline.sql"), "select 1;\n");
  writeFileSync(resolve(mirror, "20260101000000_baseline.sql"), "mismatched\n");

  const authorityBefore = snapshot(authority);
  const synchronized = syncBaselineMirror({
    authorityDirectory: authority,
    mirrorDirectory: mirror,
    baseline,
  });
  assert.deepEqual(synchronized, ["20260101000000_baseline.sql"]);
  assert.deepEqual(contentsAndHashes(snapshot(mirror)), contentsAndHashes(authorityBefore));
  assert.deepEqual(snapshot(authority), authorityBefore);

  const authorityAfterFirstSync = snapshot(authority);
  const mirrorAfterFirstSync = snapshot(mirror);
  syncBaselineMirror({ authorityDirectory: authority, mirrorDirectory: mirror, baseline });
  assert.deepEqual(snapshot(authority), authorityAfterFirstSync);
  assert.deepEqual(snapshot(mirror), mirrorAfterFirstSync);

  rmSync(resolve(mirror, "20260101000000_baseline.sql"));
  assert.throws(
    () => syncBaselineMirror({ authorityDirectory: authority, mirrorDirectory: mirror, baseline }),
    /must contain only the regular policy-selected baseline file/,
  );
  writeFileSync(resolve(mirror, "20260101000000_baseline.sql"), "select 1;\n");

  writeFileSync(outside, "outside must remain unchanged\n");
  rmSync(resolve(mirror, "20260101000000_baseline.sql"));
  symlinkSync(outside, resolve(mirror, "20260101000000_baseline.sql"));
  assert.throws(
    () => syncBaselineMirror({ authorityDirectory: authority, mirrorDirectory: mirror, baseline }),
    /must contain only the regular policy-selected baseline file/,
  );
  assert.equal(readFileSync(outside, "utf8"), "outside must remain unchanged\n");
  rmSync(resolve(mirror, "20260101000000_baseline.sql"));
  writeFileSync(resolve(mirror, "20260101000000_baseline.sql"), "select 1;\n");

  writeFileSync(resolve(authority, "extra.sql"), "select 2;\n");
  assert.throws(
    () => syncBaselineMirror({ authorityDirectory: authority, mirrorDirectory: mirror, baseline }),
    /must contain only the regular policy-selected baseline file/,
  );
  rmSync(resolve(authority, "extra.sql"));
  mkdirSync(resolve(authority, "nested"));
  assert.throws(
    () => syncBaselineMirror({ authorityDirectory: authority, mirrorDirectory: mirror, baseline }),
    /must contain only the regular policy-selected baseline file/,
  );
  rmSync(resolve(authority, "nested"), { recursive: true });
  writeFileSync(resolve(mirror, "stale"), "stale\n");
  assert.throws(
    () => syncBaselineMirror({ authorityDirectory: authority, mirrorDirectory: mirror, baseline }),
    /must contain only the regular policy-selected baseline file/,
  );
  rmSync(resolve(mirror, "stale"));
  mkdirSync(resolve(mirror, "nested"));
  assert.throws(
    () => syncBaselineMirror({ authorityDirectory: authority, mirrorDirectory: mirror, baseline }),
    /must contain only the regular policy-selected baseline file/,
  );
  assert.equal(readFileSync(outside, "utf8"), "outside must remain unchanged\n");
  console.log(
    "[db:baseline:mirror:test] deterministic, idempotent, policy-bound, and symlink-safe fixture sync OK",
  );
} finally {
  rmSync(fixtureRoot, { force: true, recursive: true });
}
