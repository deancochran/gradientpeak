#!/usr/bin/env tsx

import { Pool } from "pg";
import { prepareDbEnv } from "./_helpers";

const expectedBuckets = [
  ["activity-files", false, "52428800"],
  ["gpx-routes", false, "10485760"],
  ["profile-avatars", true, "5242880"],
] as const;
const expectedPolicies = [
  "Service role can manage all activity files",
  "Users can manage their own avatar",
  "Users can manage their own routes",
  "Users can read their own activity files",
  "Users can upload their own activity files",
];

async function main() {
  const pool = new Pool({ connectionString: prepareDbEnv() });
  try {
    const buckets = await pool.query<{
      id: string;
      public: boolean;
      file_size_limit: string;
    }>(`
      select id, public, file_size_limit::text
      from storage.buckets
      where id in ('activity-files', 'gpx-routes', 'profile-avatars')
      order by id
    `);
    const actualBuckets = buckets.rows.map((row) => [row.id, row.public, row.file_size_limit]);
    if (JSON.stringify(actualBuckets) !== JSON.stringify(expectedBuckets)) {
      throw new Error(`storage bucket convergence failed: ${JSON.stringify(actualBuckets)}`);
    }
    const policies = await pool.query<{ policyname: string }>(
      `
      select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = any($1::text[])
      order by policyname
    `,
      [expectedPolicies],
    );
    const actualPolicies = policies.rows.map((row) => row.policyname);
    if (JSON.stringify(actualPolicies) !== JSON.stringify([...expectedPolicies].sort())) {
      throw new Error(`storage policy convergence failed: ${JSON.stringify(actualPolicies)}`);
    }
    console.log("[db:storage:check] 3 buckets and 5 policies match owned configuration");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[db:storage:check] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
