CREATE TABLE `activity_recording_streams` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_recording_id` text NOT NULL,
	`metric` text NOT NULL,
	`data_type` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`data` jsonb NOT NULL,
	`timestamps` jsonb NOT NULL,
	`synced` boolean DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`activity_recording_id`) REFERENCES `activity_recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`state` text NOT NULL,
	`synced` boolean DEFAULT false NOT NULL,
	`activity_type` text NOT NULL,
	`version` text NOT NULL,
	`profile_id` text NOT NULL,
	`profile_weight_kg` real,
	`profile_ftp` real,
	`profile_threshold_hr` integer,
	`planned_activity_id` text,
	`planned_activity_name` text,
	`planned_activity_description` text,
	`planned_activity_structure_version` text,
	`planned_activity_structure` jsonb,
	`planned_activity_estimated_duration` integer,
	`planned_activity_estimated_distance` real,
	`planned_activity_estimated_tss` real,
	`created_at` integer NOT NULL
);
