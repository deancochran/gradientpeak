import assert from "node:assert/strict";
import { isEmptyPublicSchemaDiff } from "./verify-fresh-target";

const emptyEnvelope = JSON.stringify({
  diff: "\n",
  file: null,
  files: [],
  schemas: ["public"],
  engine: "migra",
  dropStatements: [],
  message: "Diff complete.",
});
assert.equal(isEmptyPublicSchemaDiff(""), true);
assert.equal(isEmptyPublicSchemaDiff("\n\t"), true);
assert.equal(isEmptyPublicSchemaDiff(emptyEnvelope), true);
assert.equal(isEmptyPublicSchemaDiff("create table unexpected ();"), false);
assert.equal(
  isEmptyPublicSchemaDiff(JSON.stringify({ ...JSON.parse(emptyEnvelope), diff: "alter table x" })),
  false,
);
assert.equal(
  isEmptyPublicSchemaDiff(JSON.stringify({ ...JSON.parse(emptyEnvelope), warning: "new CLI" })),
  false,
);
assert.equal(isEmptyPublicSchemaDiff("{not json"), false);
console.info(
  "[db:fresh-diff] empty text and known CLI envelope accepted; SQL and unknown/error output fail closed",
);
