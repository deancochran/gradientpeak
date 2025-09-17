CREATE TABLE `local_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`activity_type` text NOT NULL,
	`start_date` integer NOT NULL,
	`total_distance` real DEFAULT 0,
	`total_time` integer DEFAULT 0,
	`profile_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text,
	`scheduled_at` integer,
	`delivered_at` integer,
	`read` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text,
	`attempts` integer DEFAULT 0,
	`last_attempted_at` integer,
	`status` text DEFAULT 'pending'
);
