import { createDbClient } from "@repo/db/client";
import { profiles, users } from "@repo/db/schema";
import { eq, ilike } from "drizzle-orm";
import { localE2EDatabaseUrl } from "./database-url";

export {
  DEFAULT_LOCAL_DATABASE_URL,
  localE2EDatabaseEnvironment,
  localE2EDatabaseUrl,
} from "./database-url";

export type E2EActor = {
  email: string;
  profileId: string;
};

/** The schema-bound client used by E2E fixtures for ordinary data access. */
export type E2EDrizzleDatabase = ReturnType<typeof createDbClient>["db"];
export type E2EDrizzleTransaction = Parameters<E2EDrizzleDatabase["transaction"]>[0] extends (
  transaction: infer Transaction,
) => unknown
  ? Transaction
  : never;

export class LocalE2EDatabase {
  readonly db: E2EDrizzleDatabase;
  readonly #closePool: () => Promise<void>;
  #closed = false;

  constructor(
    options: { max?: number; connectionTimeoutMillis?: number; queryTimeout?: number } = {},
  ) {
    const client = createDbClient(
      { url: localE2EDatabaseUrl() },
      {
        connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
        max: options.max,
        query_timeout: options.queryTimeout ?? 10_000,
      },
    );
    this.db = client.db;
    this.#closePool = client.close;
  }

  /**
   * Pins a Drizzle transaction to one PostgreSQL connection. New fixtures must
   * use this typed handle rather than issuing SQL text through the pool.
   */
  async typedTransaction<Result>(operation: (database: E2EDrizzleTransaction) => Promise<Result>) {
    this.#assertOpen();
    return this.db.transaction(operation);
  }

  async actorByEmail(email: string): Promise<E2EActor | null> {
    this.#assertOpen();
    const [actor] = await this.db
      .select({ email: users.email, profileId: profiles.id })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.id))
      .where(ilike(users.email, email))
      .limit(1);
    return actor ? { email: actor.email, profileId: actor.profileId } : null;
  }

  async requireActorByEmail(email: string) {
    const actor = await this.actorByEmail(email);
    if (!actor) throw new Error(`The local E2E actor ${email} has not been provisioned.`);
    return actor;
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    await this.#closePool();
  }

  #assertOpen() {
    if (this.#closed) throw new Error("The local E2E database pool is already closed.");
  }
}

export async function withLocalE2EDatabase<Result>(
  operation: (database: LocalE2EDatabase) => Promise<Result>,
  options?: ConstructorParameters<typeof LocalE2EDatabase>[0],
) {
  const database = new LocalE2EDatabase(options);
  try {
    return await operation(database);
  } finally {
    await database.close();
  }
}
