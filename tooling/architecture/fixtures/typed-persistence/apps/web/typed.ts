declare const db: {
  select(): { from(table: unknown): Promise<unknown[]> };
  query: { users: { findMany(): Promise<unknown[]> } };
};
declare const trpc: { users: { list: { query(input: { limit: number }): Promise<unknown[]> } } };

void db.select().from({});
void db.query.users.findMany();
void trpc.users.list.query({ limit: 1 });
