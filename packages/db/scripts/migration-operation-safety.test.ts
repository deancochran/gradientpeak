import { expectedCreateIndexStatement, validateAutocommitOperation } from "./_migration-operations";

const eventOperation = {
  kind: "create_index_concurrently" as const,
  schema: "public",
  indexName: "idx_events_planned_day_summary",
  table: "public.events",
  definition: "profile_id, scheduled_date, starts_at, id, activity_plan_id",
  predicate: "event_type = 'planned' and status in ('scheduled', 'completed')",
};

function expectRejected(label: string, action: () => void) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && /(unsafe|unsupported|exactly one statement)/.test(error.message))
      return;
    throw error;
  }
  throw new Error(`${label} was accepted`);
}

for (const operation of [eventOperation]) {
  validateAutocommitOperation(expectedCreateIndexStatement(operation), operation);
}

for (const unsafeValue of ["\0", "\n", "\r", "\t", "\u001f", "\u007f"]) {
  expectRejected(`control character ${JSON.stringify(unsafeValue)}`, () =>
    expectedCreateIndexStatement({ ...eventOperation, definition: `profile_id${unsafeValue}` }),
  );
}
for (const unsafeValue of [";", "--", "/*", "*/", "'", '"', "`", "\\"]) {
  expectRejected(`unsafe metadata token ${JSON.stringify(unsafeValue)}`, () =>
    expectedCreateIndexStatement({ ...eventOperation, definition: `profile_id${unsafeValue}` }),
  );
}

expectRejected("coordinated metadata and SQL second statement", () =>
  validateAutocommitOperation(
    "create index concurrently x on public.events using btree (id); drop table public.events;",
    { ...eventOperation, definition: "profile_id; drop table public.events" },
  ),
);
expectRejected("SQL second statement with approved metadata", () =>
  validateAutocommitOperation(
    `${expectedCreateIndexStatement(eventOperation)} select 1;`,
    eventOperation,
  ),
);
expectRejected("missing statement terminator", () =>
  validateAutocommitOperation(
    expectedCreateIndexStatement(eventOperation).slice(0, -1),
    eventOperation,
  ),
);

console.log(
  "[db:migration:operation:safety:test] control characters, unsafe metadata, valid operations, and exact one-statement parsing verified",
);
