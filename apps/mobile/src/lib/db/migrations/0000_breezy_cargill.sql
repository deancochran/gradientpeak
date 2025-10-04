CREATE TABLE `activity_recording_streams` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_recording_id` text NOT NULL,
	`metric` text NOT NULL,
	`data_type` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`data` text NOT NULL,
	`timestamps` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`activity_recording_id`) REFERENCES `activity_recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text,
	`ended_at` text,
	`activity_type` text DEFAULT 'outdoor_run' NOT NULL,
	`profile` text NOT NULL,
	`planned_activity_id` text,
	`activity_plan` text
);
