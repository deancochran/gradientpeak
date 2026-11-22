import assert from "node:assert/strict";
import {
  assertExactFingerprint,
  assertRestoreEquivalentFingerprint,
} from "./coaching-completion-review-upgrade";

const fingerprint = {
  columns: [
    {
      table: "activity_plans",
      name: "id",
      position: 1,
      type: "uuid",
      notNull: true,
      identity: "",
      generated: "",
      default: "gen_random_uuid()",
    },
    {
      table: "activity_plans",
      name: "semantic_hash",
      position: 20,
      type: "text",
      notNull: true,
      identity: "",
      generated: "",
      default: "",
    },
    {
      table: "events",
      name: "id",
      position: 1,
      type: "uuid",
      notNull: true,
      identity: "",
      generated: "",
      default: "",
    },
    {
      table: "events",
      name: "linked_activity_id",
      position: 17,
      type: "uuid",
      notNull: false,
      identity: "",
      generated: "",
      default: "",
    },
  ],
  tables: [{ name: "activity_plans", rls: true, forceRls: false, acl: "acl" }],
  defaultPrivileges: [{ owner: "postgres", objectType: "r", acl: "acl" }],
  functions: [{ identity: "public.test()", acl: "acl", definition: "select 1" }],
};

const restored = {
  ...fingerprint,
  columns: fingerprint.columns.map((column, index) => ({
    ...column,
    position: index === 1 ? 18 : index === 3 ? 15 : column.position,
  })),
};

assert.doesNotThrow(() => assertRestoreEquivalentFingerprint(fingerprint, restored));
assert.throws(
  () =>
    assertRestoreEquivalentFingerprint(fingerprint, {
      ...restored,
      columns: [restored.columns[1], restored.columns[0], ...restored.columns.slice(2)],
    }),
  /restored archive differs/,
  "per-table logical column order remains strict",
);
assert.throws(
  () =>
    assertRestoreEquivalentFingerprint(fingerprint, {
      ...restored,
      columns: restored.columns.map((column) =>
        column.name === "semantic_hash" ? { ...column, type: "uuid" } : column,
      ),
    }),
  /restored archive differs/,
  "all logical column properties remain strict",
);
assert.throws(
  () =>
    assertRestoreEquivalentFingerprint(fingerprint, {
      ...restored,
      columns: restored.columns.map((column) =>
        column.name === "semantic_hash" ? { ...column, default: "'changed'::text" } : column,
      ),
    }),
  /restored archive differs/,
  "column defaults remain strict",
);
assert.throws(
  () =>
    assertRestoreEquivalentFingerprint(fingerprint, {
      ...restored,
      tables: [{ ...fingerprint.tables[0], acl: "changed-acl" }],
    }),
  /restored archive differs/,
  "non-column fingerprint sections remain strict",
);

// Production activation intentionally continues to use JSON equality. A raw
// physical position drift that rehearsal accepts must still fail its preflight.
assert.throws(
  () => assertExactFingerprint(fingerprint, restored, "pre-upgrade fingerprint mismatch"),
  /pre-upgrade fingerprint mismatch/,
);

console.log(
  "[coaching:completion-review:restore-equivalence:test] logical restore positions accepted; logical columns and non-column fingerprint drift rejected; preview strict equality retained",
);
