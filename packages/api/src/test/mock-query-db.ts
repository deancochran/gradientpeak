import { vi } from "vitest";

export type QueryResult = {
  data: any;
  error: { message: string } | null;
  count?: number | null;
};

export type QueryMap = Record<string, QueryResult | QueryResult[]>;

export type QueryCall = {
  table: string;
  operation: "delete" | "execute" | "insert" | "select" | "update";
  payload?: unknown;
};

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
    const candidate =
      (table as any)?._?.name ??
      (table as any)?._?.baseName ??
      (table as any)?._?.tableName ??
      (table as any).config?.name ??
      (table as any).tableName ??
      (table as any).name;

    if (typeof candidate === "string") {
      return candidate;
    }

    for (const symbol of Object.getOwnPropertySymbols(table)) {
      const value = (table as any)[symbol];
      if (typeof value === "string" && /^[a-z_]+$/i.test(value)) {
        return value;
      }
      if (value && typeof value === "object") {
        const symbolName = value.name ?? value.baseName ?? value.tableName;
        if (typeof symbolName === "string") {
          return symbolName;
        }
      }
    }
  }

  return "unknown";
}

function extractSqlText(query: unknown): string {
  const chunks = (query as any)?.queryChunks;
  if (!Array.isArray(chunks)) return "";

  return chunks
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (Array.isArray((chunk as any)?.value)) {
        return (chunk as any).value.join("");
      }
      if (typeof (chunk as any)?.value === "string") {
        return (chunk as any).value;
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
    const builder: any = {
      from: vi.fn((table: unknown) => {
        const resolvedTable = extractTableName(table);
        return createSelectBuilder(resolvedTable);
      }),
      leftJoin: vi.fn(() => builder),
      where: vi.fn(() => builder),
      orderBy: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: (onFulfilled: (value: unknown[]) => unknown) => {
        callLog.push({ table: tableName, operation: "select" });
        return Promise.resolve(toRows(tableName, nextResult(tableName))).then(onFulfilled);
      },
    };

    return builder;
  };

  const createWriteBuilder = (tableName: string, operation: QueryCall["operation"]) => {
    let payloadForReturn: unknown = undefined;

    const builder: any = {
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
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(toRows(tableName, nextResult(tableName))).then(onFulfilled),
    };

    return builder;
  };

  const db: any = {
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
  };

  return { db, callLog, nextResult };
}
