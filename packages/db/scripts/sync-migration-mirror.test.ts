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
import { syncMigrationMirror } from "./sync-migration-mirror";

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "gradientpeak-migration-mirror-"));
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
  writeFileSync(resolve(authority, "20260101000000_first.sql"), "select 1;\n");
  writeFileSync(resolve(authority, "20260101000001_second.sql"), "select 2;\n");
  mkdirSync(resolve(authority, "nested"));
  writeFileSync(resolve(authority, "nested/ignored.sql"), "select ignored;\n");
  writeFileSync(resolve(mirror, "20260101000000_first.sql"), "mismatched\n");
  writeFileSync(resolve(mirror, "stale.sql"), "stale\n");
  mkdirSync(resolve(mirror, "nested"));
  writeFileSync(resolve(mirror, "nested/ignored.sql"), "keep nested\n");
  writeFileSync(resolve(mirror, "unexpected.txt"), "keep non-sql\n");

  const authorityBefore = snapshot(authority);
  const synchronized = syncMigrationMirror({
    authorityDirectory: authority,
    mirrorDirectory: mirror,
  });
  assert.deepEqual(synchronized, ["20260101000000_first.sql", "20260101000001_second.sql"]);
  assert.deepEqual(contentsAndHashes(snapshot(mirror)), contentsAndHashes(authorityBefore));
  assert.deepEqual(snapshot(authority), authorityBefore);
  assert.equal(lstatSync(resolve(mirror, "stale.sql"), { throwIfNoEntry: false }), undefined);
  assert.equal(readFileSync(resolve(mirror, "nested/ignored.sql"), "utf8"), "keep nested\n");
  assert.equal(readFileSync(resolve(mirror, "unexpected.txt"), "utf8"), "keep non-sql\n");

  const authorityAfterFirstSync = snapshot(authority);
  const mirrorAfterFirstSync = snapshot(mirror);
  syncMigrationMirror({ authorityDirectory: authority, mirrorDirectory: mirror });
  assert.deepEqual(snapshot(authority), authorityAfterFirstSync);
  assert.deepEqual(snapshot(mirror), mirrorAfterFirstSync);

  writeFileSync(outside, "outside must remain unchanged\n");
  rmSync(resolve(mirror, "20260101000000_first.sql"));
  symlinkSync(outside, resolve(mirror, "20260101000000_first.sql"));
  syncMigrationMirror({ authorityDirectory: authority, mirrorDirectory: mirror });
  assert.equal(readFileSync(outside, "utf8"), "outside must remain unchanged\n");
  assert.equal(lstatSync(resolve(mirror, "20260101000000_first.sql")).isSymbolicLink(), false);

  symlinkSync(outside, resolve(authority, "linked.sql"));
  assert.throws(
    () => syncMigrationMirror({ authorityDirectory: authority, mirrorDirectory: mirror }),
    /authority migration entry must be a regular file: linked\.sql/,
  );
  assert.equal(readFileSync(outside, "utf8"), "outside must remain unchanged\n");
  console.log(
    "[db:migration:mirror:test] deterministic, idempotent, and symlink-safe fixture sync OK",
  );
} finally {
  rmSync(fixtureRoot, { force: true, recursive: true });
}
