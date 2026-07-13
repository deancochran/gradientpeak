#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { Pool } from "pg";
import { schema } from "../src/schema";
import * as enumSchema from "../src/schema/enums";
import { dbPackageRoot, prepareDbEnv } from "./_helpers";

const databaseUrl = prepareDbEnv();
const transitionalExtras = JSON.parse(
  readFileSync(resolve(dbPackageRoot, "transitional-schema-extras.json"), "utf8"),
) as { columns: Array<{ table: string; name: string }> };
const allowedExtraColumns = new Set(
  transitionalExtras.columns.map((entry) => `${entry.table}.${entry.name}`),
);

type ExpectedColumn = {
  name: string;
  isNullable: boolean;
  hasDefault: boolean;
};

type ActualColumn = {
  name: string;
  isNullable: boolean;
  hasDefault: boolean;
};

type SchemaColumnMetadata = {
  name: string;
  notNull?: boolean;
  hasDefault?: boolean;
  default?: unknown;
  defaultFn?: unknown;
  generated?: unknown;
};

type SchemaEnumMetadata = {
  enumName?: unknown;
  enumValues?: unknown;
};

function getSchemaTables() {
  return Object.values(schema).flatMap((value) => {
    try {
      const columns = Object.values(getTableColumns(value as never)).map((column) => {
        const metadata = column as SchemaColumnMetadata;

        return {
          name: metadata.name,
          isNullable: !metadata.notNull,
          hasDefault: Boolean(
            metadata.hasDefault ||
              metadata.default !== undefined ||
              metadata.defaultFn ||
              metadata.generated,
          ),
        };
      });
      const tableName = getTableName(value as never);

      return [
        {
          tableName,
          columns: columns.sort((left, right) => left.name.localeCompare(right.name)),
        },
      ];
    } catch {
      return [];
    }
  });
}

function getSchemaEnums() {
  return Object.values(enumSchema).flatMap((value) => {
    const metadata = value as SchemaEnumMetadata;

    if (typeof metadata.enumName !== "string" || !Array.isArray(metadata.enumValues)) {
      return [];
    }

    return [
      {
        enumName: metadata.enumName,
        values: metadata.enumValues
          .filter((enumValue): enumValue is string => typeof enumValue === "string")
          .sort(),
      },
    ];
  });
}

async function getActualColumnsByTable(pool: Pool) {
  const result = await pool.query<{
    table_name: string;
    column_name: string;
    is_nullable: "YES" | "NO";
    is_identity: "YES" | "NO";
    column_default: string | null;
  }>(
    `
      select table_name, column_name, is_nullable, is_identity, column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name asc, ordinal_position asc
    `,
  );

  const columnsByTable = new Map<string, ActualColumn[]>();
  for (const row of result.rows) {
    const existing = columnsByTable.get(row.table_name) ?? [];
    existing.push({
      name: row.column_name,
      isNullable: row.is_nullable === "YES",
      hasDefault: row.column_default !== null || row.is_identity === "YES",
    });
    columnsByTable.set(row.table_name, existing);
  }

  return columnsByTable;
}

async function getActualEnums(pool: Pool) {
  const result = await pool.query<{
    enum_name: string;
    enum_value: string;
  }>(
    `
      select t.typname as enum_name, e.enumlabel as enum_value
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      order by t.typname asc, e.enumsortorder asc
    `,
  );

  const valuesByEnum = new Map<string, string[]>();
  for (const row of result.rows) {
    const existing = valuesByEnum.get(row.enum_name) ?? [];
    existing.push(row.enum_value);
    valuesByEnum.set(row.enum_name, existing);
  }

  return valuesByEnum;
}

function formatColumns(columns: ExpectedColumn[] | ActualColumn[]) {
  return columns.map((column) => column.name).join(", ");
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const expectedTables = getSchemaTables();
    const actualColumnsByTable = await getActualColumnsByTable(pool);
    const expectedEnums = getSchemaEnums();
    const actualEnums = await getActualEnums(pool);
    const driftMessages: string[] = [];

    for (const expectedTable of expectedTables) {
      const actualColumns = actualColumnsByTable.get(expectedTable.tableName) ?? [];
      const missingColumns = expectedTable.columns.filter(
        (column) => !actualColumns.some((actualColumn) => actualColumn.name === column.name),
      );
      const extraColumns = actualColumns.filter(
        (column) =>
          !expectedTable.columns.some((expectedColumn) => expectedColumn.name === column.name) &&
          !allowedExtraColumns.has(`${expectedTable.tableName}.${column.name}`),
      );

      if (actualColumns.length === 0) {
        driftMessages.push(`table ${expectedTable.tableName} is missing`);
        continue;
      }

      if (missingColumns.length > 0) {
        driftMessages.push(
          `table ${expectedTable.tableName} is missing columns: ${formatColumns(missingColumns)}`,
        );
      }

      if (extraColumns.length > 0) {
        driftMessages.push(
          `table ${expectedTable.tableName} has unexpected columns: ${formatColumns(extraColumns)}`,
        );
      }

      for (const expectedColumn of expectedTable.columns) {
        const actualColumn = actualColumns.find((column) => column.name === expectedColumn.name);

        if (!actualColumn) {
          continue;
        }

        if (actualColumn.isNullable !== expectedColumn.isNullable) {
          driftMessages.push(
            `table ${expectedTable.tableName}.${expectedColumn.name} nullability mismatch: expected ${
              expectedColumn.isNullable ? "nullable" : "not null"
            }, found ${actualColumn.isNullable ? "nullable" : "not null"}`,
          );
        }

        if (expectedColumn.hasDefault && !actualColumn.hasDefault) {
          driftMessages.push(
            `table ${expectedTable.tableName}.${expectedColumn.name} is missing expected default`,
          );
        }
      }
    }

    for (const declaredExtra of transitionalExtras.columns) {
      const actualColumns = actualColumnsByTable.get(declaredExtra.table) ?? [];
      if (!actualColumns.some((column) => column.name === declaredExtra.name)) {
        driftMessages.push(
          `declared transitional column ${declaredExtra.table}.${declaredExtra.name} is missing before contract`,
        );
      }
    }

    for (const expectedEnum of expectedEnums) {
      const actualValues = actualEnums.get(expectedEnum.enumName) ?? [];

      if (actualValues.length === 0) {
        driftMessages.push(`enum ${expectedEnum.enumName} is missing`);
        continue;
      }

      const expectedValues = [...expectedEnum.values].sort();
      const sortedActualValues = [...actualValues].sort();
      const missingValues = expectedValues.filter((value) => !sortedActualValues.includes(value));
      const extraValues = sortedActualValues.filter((value) => !expectedValues.includes(value));

      if (missingValues.length > 0) {
        driftMessages.push(
          `enum ${expectedEnum.enumName} is missing values: ${missingValues.join(", ")}`,
        );
      }

      if (extraValues.length > 0) {
        driftMessages.push(
          `enum ${expectedEnum.enumName} has unexpected values: ${extraValues.join(", ")}`,
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
