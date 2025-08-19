import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as migrator } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Read the .env file if it exists
dotenv.config();

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL not found in environment");
}

const connectionString = process.env.SUPABASE_DB_URL;

async function migrate() {
  console.log("⏳ Running migrations...");

  const connection = postgres(connectionString, { max: 1 });
  const db = drizzle(connection);

  await migrator(db, { migrationsFolder: "./migrations" });
  console.log("✅ Migrations completed!");

  await connection.end();
  process.exit(0);
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

export default migrate;
