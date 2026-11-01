import { randomUUID } from "node:crypto";

import { hash } from "bcryptjs";
import { Pool } from "pg";

export const acceptanceUser = {
  email: "browser-acceptance@gradientpeak.test",
  id: "8a944448-6e74-4ee8-94f0-93621c212dc0",
  name: "Browser Acceptance",
  password: ["browser", "acceptance", "password"].join("-"),
} as const;

export async function seedAcceptanceUser(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const passwordHash = await hash(acceptanceUser.password, 10);
    const now = new Date();

    await pool.query(
      `insert into users (id, name, email, email_verified, created_at, updated_at)
       values ($1, $2, $3, true, $4, $4)`,
      [acceptanceUser.id, acceptanceUser.name, acceptanceUser.email, now],
    );
    await pool.query(
      `insert into accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
       values ($1, $2, 'credential', $3, $4, $5, $5)`,
      [randomUUID(), acceptanceUser.id, acceptanceUser.id, passwordHash, now],
    );
    await pool.query(
      `insert into profiles (id, created_at, updated_at, email, full_name, username, onboarded, is_public)
       values ($1, $2, $2, $3, $4, $5, true, false)`,
      [acceptanceUser.id, now, acceptanceUser.email, acceptanceUser.name, "browser-acceptance"],
    );
  } finally {
    await pool.end();
  }
}
