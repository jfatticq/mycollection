CREATE TABLE `catalog_merges` (
	`source_id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`mapping` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deletion_jobs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`remaining_keys` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL,
	`committed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL
);
