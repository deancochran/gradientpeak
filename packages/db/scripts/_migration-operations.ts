import { createHash } from "node:crypto";

export type CreateIndexConcurrentlyOperation = {
  kind: "create_index_concurrently";
  schema: string;
  indexName: string;
  table: string;
  definition: string;
  predicate?: string;
};

export type MigrationOperation = CreateIndexConcurrentlyOperation;

function canonical(sql: string) {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s*,\s*/g, ", ")
    .toLowerCase();
}

export function expectedCreateIndexStatement(operation: CreateIndexConcurrentlyOperation) {
  validateOperationMetadata(operation);
  const predicate = operation.predicate ? ` where ${operation.predicate}` : "";
  return `create index concurrently ${operation.indexName} on ${operation.table} using btree (${operation.definition})${predicate};`;
}

function validateOperationMetadata(operation: CreateIndexConcurrentlyOperation) {
  const identifier = /^[a-z][a-z0-9_]*$/;
  if (!identifier.test(operation.schema) || !identifier.test(operation.indexName))
    throw new Error("autocommit index metadata contains an unsafe identifier");
  if (!/^public\.[a-z][a-z0-9_]*$/.test(operation.table))
    throw new Error("autocommit index metadata contains an unsafe table identifier");
  if (
    hasUnsafeMetadataTokens(operation.definition, { allowSingleQuotes: false }) ||
    (operation.predicate &&
      hasUnsafeMetadataTokens(operation.predicate, { allowSingleQuotes: true }))
  )
    throw new Error("autocommit index metadata contains unsafe SQL tokens");
  const approvedDefinition = /^(profile_id, scheduled_date, starts_at, id(?:, activity_plan_id)?)$/;
  if (!approvedDefinition.test(operation.definition))
    throw new Error("autocommit index metadata has an unsupported definition");
  if (
    operation.predicate &&
    operation.predicate !== "event_type = 'planned' and status in ('scheduled', 'completed')"
  )
    throw new Error("autocommit index metadata has an unsupported predicate");
}

function hasUnsafeMetadataTokens(
  value: string,
  { allowSingleQuotes }: { allowSingleQuotes: boolean },
) {
  for (let offset = 0; offset < value.length; ) {
    const codePoint = value.codePointAt(offset);
    if (codePoint === undefined) break;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;

    const character = String.fromCodePoint(codePoint);
    if (
      character === ";" ||
      character === '"' ||
      character === "`" ||
      character === "\\" ||
      (!allowSingleQuotes && character === "'")
    )
      return true;
    if (
      value.startsWith("--", offset) ||
      value.startsWith("/*", offset) ||
      value.startsWith("*/", offset)
    )
      return true;

    offset += character.length;
  }
  return false;
}

export function validateAutocommitOperation(
  sql: string,
  operation: MigrationOperation | undefined,
) {
  if (!operation) throw new Error("autocommit migration is missing structured operation metadata");
  if (operation.kind !== "create_index_concurrently")
    throw new Error(
      `unsupported autocommit migration operation: ${(operation as { kind?: string }).kind}`,
    );
  const actual = canonical(sql);
  if ((actual.match(/;/g) ?? []).length !== 1 || !actual.endsWith(";"))
    throw new Error("autocommit migration must contain exactly one statement");
  const expected = canonical(expectedCreateIndexStatement(operation));
  if (actual !== expected)
    throw new Error(
      `autocommit migration must be exactly one declared CREATE INDEX CONCURRENTLY statement for ${operation.schema}.${operation.indexName}; expected=${expected} actual=${actual}`,
    );
}

export function statementSha256(sql: string) {
  return createHash("sha256").update(sql).digest("hex");
}

export function invalidIndexCleanup(operation: MigrationOperation) {
  return `DROP INDEX CONCURRENTLY IF EXISTS ${operation.schema}.${operation.indexName}`;
}
