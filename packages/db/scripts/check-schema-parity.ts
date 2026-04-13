#!/usr/bin/env tsx

import { getTableColumns, getTableName } from "drizzle-orm";
import { Pool } from "pg";
import { schema } from "../src/schema";
import { prepareDbEnv } from "./_helpers";

const databaseUrl = prepareDbEnv();

function getSchemaTables() {
  return Object.values(schema).flatMap((value) => {
    try {
      const columns = Object.values(getTableColumns(value as never)).map(
        (column: any) => column.name,
      );
      const tableName = getTableName(value as never);

      return [{ tableName, columns: columns.sort() }];
    } catch {
      return [];
    }
  });
}

async function getActualColumnsByTable(pool: Pool) {
  const result = await pool.query<{
    table_name: string;
    column_name: string;
  }>(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
      order by table_name asc, ordinal_position asc
    `,
  );

  const columnsByTable = new Map<string, string[]>();
  for (const row of result.rows) {
    const existing = columnsByTable.get(row.table_name) ?? [];
    existing.push(row.column_name);
    columnsByTable.set(row.table_name, existing);
  }

  return columnsByTable;
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const expectedTables = getSchemaTables();
    const actualColumnsByTable = await getActualColumnsByTable(pool);
    const driftMessages: string[] = [];

    for (const expectedTable of expectedTables) {
      const actualColumns = actualColumnsByTable.get(expectedTable.tableName) ?? [];
      const missingColumns = expectedTable.columns.filter(
        (column) => !actualColumns.includes(column),
      );
      const extraColumns = actualColumns.filter(
        (column) => !expectedTable.columns.includes(column),
      );

      if (actualColumns.length === 0) {
        driftMessages.push(`table ${expectedTable.tableName} is missing`);
        continue;
      }

      if (missingColumns.length > 0) {
        driftMessages.push(
          `table ${expectedTable.tableName} is missing columns: ${missingColumns.join(", ")}`,
        );
      }

      if (extraColumns.length > 0) {
        driftMessages.push(
          `table ${expectedTable.tableName} has unexpected columns: ${extraColumns.join(", ")}`,
        );
      }
    }

    if (driftMessages.length > 0) {
      console.error(
        "[db:schema:check] schema drift detected between Drizzle schema and local database",
      );
      console.error(
        "[db:schema:check] Reproduce locally with: pnpm --filter @repo/db db:schema:check",
      );
      for (const message of driftMessages) {
        console.error(`- ${message}`);
      }
      process.exit(1);
    }

    console.log("[db:schema:check] schema parity OK");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[db:schema:check] failed to check schema parity");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
