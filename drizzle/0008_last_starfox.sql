ALTER TABLE `catalog_releases` ADD `classification_mode` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_releases` ADD `contents_complete` integer DEFAULT false NOT NULL;