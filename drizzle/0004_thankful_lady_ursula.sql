CREATE TABLE `merge_holdings` (
	`operation_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`part_id` text NOT NULL,
	`quantity` integer,
	`condition` text,
	`defects` text NOT NULL,
	PRIMARY KEY(`operation_id`, `entry_id`, `part_id`)
);
--> statement-breakpoint
CREATE TABLE `operation_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "operation_must_be_current" CHECK(valid = 1)
);
--> statement-breakpoint
CREATE TRIGGER entries_no_merged_insert BEFORE INSERT ON owned_entries
WHEN EXISTS(SELECT 1 FROM catalog_merges WHERE source_id=NEW.release_id)
BEGIN SELECT RAISE(ABORT,'merged release requires reload'); END;
--> statement-breakpoint
CREATE TRIGGER entries_no_merged_update BEFORE UPDATE OF release_id ON owned_entries
WHEN EXISTS(SELECT 1 FROM catalog_merges WHERE source_id=NEW.release_id)
BEGIN SELECT RAISE(ABORT,'merged release requires reload'); END;
--> statement-breakpoint
CREATE TRIGGER identities_no_deleted_insert BEFORE INSERT ON identities
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'deleted account cannot register'); END;
--> statement-breakpoint
CREATE TRIGGER collections_no_deleted_insert BEFORE INSERT ON collections
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'deleted account cannot register'); END;
--> statement-breakpoint
CREATE TRIGGER media_no_deleted_insert BEFORE INSERT ON media
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'deleted account cannot upload'); END;
