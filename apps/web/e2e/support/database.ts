import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { localE2EDatabaseUrl } from "./database-url";

export {
  DEFAULT_LOCAL_DATABASE_URL,
  localE2EDatabaseEnvironment,
  localE2EDatabaseUrl,
} from "./database-url";

export type E2EQuery = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
};

export type E2EActor = {
  email: string;
  profileId: string;
};

export type E2EConnection = E2EQuery & { release: () => void };

export class LocalE2EDatabase implements E2EQuery {
  readonly #pool: Pool;
  #closed = false;

  constructor(
    options: { max?: number; connectionTimeoutMillis?: number; queryTimeout?: number } = {},
  ) {
    this.#pool = new Pool({
      connectionString: localE2EDatabaseUrl(),
      connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
      max: options.max,
      query_timeout: options.queryTimeout ?? 10_000,
    });
  }

  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) {
    this.#assertOpen();
    return this.#pool.query<Row>(text, values ? [...values] : undefined);
  }

  async connect(): Promise<E2EConnection> {
    this.#assertOpen();
    const client = await this.#pool.connect();
    return {
      ...queryAdapter(client),
      release: () => client.release(),
    };
  }

  async transaction<Result>(operation: (client: E2EQuery) => Promise<Result>) {
    this.#assertOpen();
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      const result = await operation(queryAdapter(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async actorByEmail(email: string, query: E2EQuery = this): Promise<E2EActor | null> {
    const result = await query.query<{ email: string; id: string }>(
      `select u."email", p."id"
       from "profiles" p
       inner join "users" u on u."id" = p."id"
       where lower(u."email") = lower($1)
       limit 1`,
      [email],
    );
    const actor = result.rows[0];
    return actor ? { email: actor.email, profileId: actor.id } : null;
  }

  async requireActorByEmail(email: string, query: E2EQuery = this) {
    const actor = await this.actorByEmail(email, query);
    if (!actor) throw new Error(`The local E2E actor ${email} has not been provisioned.`);
    return actor;
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    await this.#pool.end();
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

function queryAdapter(client: PoolClient): E2EQuery {
  return {
    query: (text, values) => client.query(text, values ? [...values] : undefined),
  };
}
