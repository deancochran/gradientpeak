import { type SQL, sql } from "drizzle-orm";

export function buildUuidInList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}::uuid`),
    sql`, `,
  );
}

export function parseCountValue(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const count = typeof value === "bigint" ? Number(value) : Number(value);

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid SQL count value: ${String(value)}`);
  }

  return count;
}

export async function getSqlCount(resultPromise: Promise<{ rows: unknown[] }>): Promise<number> {
  const result = await resultPromise;
  const row = result.rows[0];

  if (!row) {
    return 0;
  }

  if (typeof row !== "object" || !("value" in row)) {
    throw new Error("SQL count result is missing value alias");
  }

  return parseCountValue(row.value);
}
