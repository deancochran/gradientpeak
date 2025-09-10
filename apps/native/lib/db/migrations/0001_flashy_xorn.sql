ALTER TABLE `local_activities` ADD `sync_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `sync_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `last_sync_attempt` integer;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `sync_error` text;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `local_fit_file_path` text;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `cloud_storage_path` text;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `avg_heart_rate` integer;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `max_heart_rate` integer;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `avg_power` integer;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `max_power` integer;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `avg_cadence` integer;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `elevation_gain` real;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `calories` integer;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `tss` real;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `created_at` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `local_activities` ADD `updated_at` integer NOT NULL;