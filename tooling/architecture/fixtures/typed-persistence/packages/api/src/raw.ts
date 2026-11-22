import { sql } from "drizzle-orm";

declare const db: { execute(query: unknown): Promise<unknown> };
declare function getSqlRows<T>(): Promise<T[]>;

void db.execute(sql`select public.can_read_profile(${"profile"})`);
void getSqlRows<{ id: string }>();
