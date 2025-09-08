import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Use connection pooling or Supabase connection
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle({ client });
