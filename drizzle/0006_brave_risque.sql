CREATE TABLE `release_characters` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`name` text NOT NULL,
	`part_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`,`release_id`) REFERENCES `catalog_parts`(`id`,`release_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `characters_release` ON `release_characters` (`release_id`);--> statement-breakpoint
CREATE INDEX `characters_name` ON `release_characters` (`name`);