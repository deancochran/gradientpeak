// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from "./meta/_journal.json";

const m0000 = `CREATE TABLE \`local_activities\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`activity_type\` text NOT NULL,
	\`start_date\` integer NOT NULL,
	\`total_distance\` real DEFAULT 0,
	\`total_time\` integer DEFAULT 0,
	\`profile_id\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`sync_queue\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`entity_id\` text NOT NULL,
	\`entity_type\` text NOT NULL,
	\`operation\` text NOT NULL,
	\`payload\` text,
	\`attempts\` integer DEFAULT 0,
	\`last_attempted_at\` integer,
	\`status\` text DEFAULT 'pending'
);`;

export default {
  journal,
  migrations: {
    m0000,
  },
};
