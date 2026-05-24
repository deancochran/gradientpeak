import { vi } from "vitest";

export type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

export type QueryMap = Record<string, QueryResult | QueryResult[]>;

export type QueryCall = {
  table: string;
  operation: "delete" | "execute" | "insert" | "select" | "update";
  payload?: unknown;
};

type DrizzleTableMetadata = {
  baseName?: unknown;
  name?: unknown;
  tableName?: unknown;
};

type DrizzleTableLike = {
  _?: DrizzleTableMetadata;
  config?: DrizzleTableMetadata;
  name?: unknown;
  tableName?: unknown;
};

type SqlChunkLike = {
  value?: unknown;
};

type SqlQueryLike = {
  queryChunks?: unknown;
};

type QueryBuilder = {
  from?: ReturnType<typeof vi.fn>;
  innerJoin?: ReturnType<typeof vi.fn>;
  leftJoin?: ReturnType<typeof vi.fn>;
  limit?: ReturnType<typeof vi.fn>;
  orderBy?: ReturnType<typeof vi.fn>;
  returning?: ReturnType<typeof vi.fn>;
  set?: ReturnType<typeof vi.fn>;
  then?: (onFulfilled: (value: unknown[]) => unknown) => Promise<unknown>;
  values?: ReturnType<typeof vi.fn>;
  where?: ReturnType<typeof vi.fn>;
};

type QueryMapDbMock = {
  delete: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  query: {
    profiles: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  select: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function attachThenable(
  builder: Omit<QueryBuilder, "then">,
  onResolve: () => unknown[],
): QueryBuilder {
  // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
  return Object.defineProperty(builder, "then", {
    value: (onFulfilled: (value: unknown[]) => unknown) =>
      Promise.resolve(onResolve()).then(onFulfilled),
  }) as QueryBuilder;
}

function normalizeTemporalFields(table: string, row: Record<string, unknown>) {
  if (table === "activities") {
    return {
      ...row,
      started_at:
        row.started_at instanceof Date
          ? row.started_at
          : typeof row.started_at === "string"
            ? new Date(row.started_at)
            : row.started_at,
      finished_at:
        row.finished_at instanceof Date
          ? row.finished_at
          : typeof row.finished_at === "string"
            ? new Date(row.finished_at)
            : typeof row.started_at === "string"
              ? new Date(row.started_at)
              : row.finished_at,
    };
  }

  if (table === "events") {
    return {
      ...row,
      starts_at:
        row.starts_at instanceof Date
          ? row.starts_at
          : typeof row.starts_at === "string"
            ? new Date(row.starts_at)
            : row.starts_at,
      ends_at:
        row.ends_at instanceof Date
          ? row.ends_at
          : typeof row.ends_at === "string"
            ? new Date(row.ends_at)
            : row.ends_at,
    };
  }

  return row;
}

function normalizeData(table: string, data: unknown) {
  if (Array.isArray(data)) {
    return data.map((row) =>
      row && typeof row === "object"
        ? normalizeTemporalFields(table, row as Record<string, unknown>)
        : row,
    );
  }

  if (data && typeof data === "object") {
    return normalizeTemporalFields(table, data as Record<string, unknown>);
  }

  return data;
}

function toRows(table: string, result: QueryResult) {
  const normalized = normalizeData(table, result.data);
  if (Array.isArray(normalized)) return normalized;
  if (normalized == null) return [];
  return [normalized];
}

function extractTableName(table: unknown): string {
  if (typeof table === "string") return table;
  if (table && typeof table === "object") {
    const tableLike = table as DrizzleTableLike;
    const candidate =
      tableLike._?.name ??
      tableLike._?.baseName ??
      tableLike._?.tableName ??
      tableLike.config?.name ??
      tableLike.tableName ??
      tableLike.name;

    if (typeof candidate === "string") {
      return candidate;
    }

    for (const symbol of Object.getOwnPropertySymbols(table)) {
      const value = (table as Record<symbol, unknown>)[symbol];
      if (typeof value === "string" && /^[a-z_]+$/i.test(value)) {
        return value;
      }
      if (value && typeof value === "object") {
        const symbolMetadata = value as DrizzleTableMetadata;
        const symbolName =
          symbolMetadata.name ?? symbolMetadata.baseName ?? symbolMetadata.tableName;
        if (typeof symbolName === "string") {
          return symbolName;
        }
      }
    }
  }

  return "unknown";
}

function extractSqlText(query: unknown): string {
  const chunks = (query as SqlQueryLike).queryChunks;
  if (!Array.isArray(chunks)) return "";

  return chunks
    .map((chunk) => {
      if (chunk == null) return "";
      if (typeof chunk === "string") return chunk;
      const chunkLike = chunk as SqlChunkLike;
      if (Array.isArray(chunkLike.value)) {
        return chunkLike.value.join("");
      }
      if (typeof chunkLike.value === "string") {
        return chunkLike.value;
      }
      return "?";
    })
    .join("")
    .toLowerCase();
}

function inferTableFromSql(query: unknown): string {
  const text = extractSqlText(query);
  const tables = [
    "training_plans",
    "profile_training_settings",
    "profile_goals",
    "activity_plans",
    "activity_efforts",
    "profile_metrics",
    "activities",
    "profiles",
    "events",
    "likes",
  ];

  return tables.find((table) => text.includes(table)) ?? "unknown";
}

export function createQueryMapDbMock(queryMap: QueryMap = {}) {
  const callLog: QueryCall[] = [];
  const counters = new Map<string, number>();

  const nextResult = (table: string): QueryResult => {
    const entry = queryMap[table];
    if (!entry) return { data: [], error: null };
    if (!Array.isArray(entry)) return { ...entry, data: normalizeData(table, entry.data) };

    const index = counters.get(table) ?? 0;
    counters.set(table, index + 1);
    const result = entry[index] ?? entry[entry.length - 1] ?? { data: [], error: null };
    return { ...result, data: normalizeData(table, result.data) };
  };

  const createSelectBuilder = (tableName: string) => {
    const builder = attachThenable(
      {
        from: vi.fn((table: unknown) => {
          const resolvedTable = extractTableName(table);
          return createSelectBuilder(resolvedTable);
        }),
        innerJoin: vi.fn(() => builder),
        leftJoin: vi.fn(() => builder),
        where: vi.fn(() => builder),
        orderBy: vi.fn(() => builder),
        limit: vi.fn(() => builder),
      },
      () => {
        callLog.push({ table: tableName, operation: "select" });
        return toRows(tableName, nextResult(tableName));
      },
    );

    return builder;
  };

  const createWriteBuilder = (tableName: string, operation: QueryCall["operation"]) => {
    let payloadForReturn: unknown;

    const builder = attachThenable(
      {
        values: vi.fn((payload: unknown) => {
          payloadForReturn = payload;
          callLog.push({ table: tableName, operation, payload });
          return builder;
        }),
        set: vi.fn((payload: unknown) => {
          payloadForReturn = payload;
          callLog.push({ table: tableName, operation, payload });
          return builder;
        }),
        where: vi.fn(() => builder),
        returning: vi.fn(async () => {
          const rows = toRows(tableName, nextResult(tableName));
          if (rows.length > 0) {
            return rows;
          }

          if (operation === "insert") {
            if (Array.isArray(payloadForReturn)) {
              return payloadForReturn.map((row, index) => ({
                id: `${tableName}-row-${index + 1}`,
                ...(row as Record<string, unknown>),
              }));
            }

            if (payloadForReturn && typeof payloadForReturn === "object") {
              return [
                {
                  id: `${tableName}-row-1`,
                  ...(payloadForReturn as Record<string, unknown>),
                },
              ];
            }
          }

          if (operation === "update" && payloadForReturn && typeof payloadForReturn === "object") {
            return [payloadForReturn as Record<string, unknown>];
          }

          return [];
        }),
      },
      () => toRows(tableName, nextResult(tableName)),
    );

    return builder;
  };

  const db: QueryMapDbMock = {
    query: {
      profiles: {
        findFirst: vi.fn(async () => toRows("profiles", nextResult("profiles"))[0] ?? null),
      },
    },
    execute: vi.fn(async (query: unknown) => {
      const tableName = inferTableFromSql(query);
      callLog.push({ table: tableName, operation: "execute", payload: extractSqlText(query) });
      const result = nextResult(tableName);
      return {
        rows: toRows(tableName, result),
        rowCount: Array.isArray(result.data) ? result.data.length : result.data == null ? 0 : 1,
      };
    }),
    select: vi.fn(() => createSelectBuilder("unknown")),
    insert: vi.fn((table: unknown) => createWriteBuilder(extractTableName(table), "insert")),
    update: vi.fn((table: unknown) => createWriteBuilder(extractTableName(table), "update")),
    delete: vi.fn((table: unknown) => createWriteBuilder(extractTableName(table), "delete")),
    transaction: vi.fn(async (callback: (tx: QueryMapDbMock) => unknown) => callback(db)),
  };

  return { db, callLog, nextResult };
}
