CREATE TABLE `catalog_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`expected_quantity` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`retired` integer DEFAULT false NOT NULL,
	`linked_release_id` text,
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`,`release_id`) REFERENCES `catalog_parts`(`id`,`release_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "part_not_self" CHECK(parent_id IS NULL OR parent_id <> id),
	CONSTRAINT "part_expected_nonnegative" CHECK(expected_quantity IS NULL OR expected_quantity >= 0),
	CONSTRAINT "part_kind" CHECK(kind IN ('primary','accessory','packaging','paperwork'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parts_id_release_unique` ON `catalog_parts` (`id`,`release_id`);--> statement-breakpoint
CREATE INDEX `parts_release_idx` ON `catalog_parts` (`release_id`);--> statement-breakpoint
CREATE TABLE `catalog_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`character` text,
	`kind` text NOT NULL,
	`year` integer,
	`line` text,
	`series` text,
	`sub_series` text,
	`wave` text,
	`scale` text,
	`faction` text,
	`market` text,
	`manufacturer` text,
	`product_code` text,
	`upc` text,
	`retail_price_cents` integer,
	`retail_currency` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`retired` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "retail_price_nonnegative" CHECK(retail_price_cents IS NULL OR retail_price_cents >= 0),
	CONSTRAINT "release_revision_positive" CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE INDEX `catalog_line_year_idx` ON `catalog_releases` (`line`,`year`);--> statement-breakpoint
CREATE TABLE `catalog_revisions` (
	`release_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`release_id`, `revision`),
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collection_visibility" CHECK(visibility IN ('private','public'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_user_unique` ON `collections` (`user_id`);--> statement-breakpoint
CREATE TABLE `file_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `identities` (
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`provider`, `subject`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `identities_user_idx` ON `identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`collection_id` text,
	`scope` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_scope" CHECK((scope = 'collection' AND collection_id IS NOT NULL) OR (scope = 'catalog' AND collection_id IS NULL)),
	CONSTRAINT "media_size_positive" CHECK(bytes > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_key_unique` ON `media` (`object_key`);--> statement-breakpoint
CREATE INDEX `media_owner_idx` ON `media` (`owner_id`);--> statement-breakpoint
CREATE TABLE `media_links` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`entry_id` text,
	`release_id` text,
	`part_id` text,
	`file_card_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `owned_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`) REFERENCES `catalog_parts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_card_id`) REFERENCES `file_cards`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_one_subject" CHECK((entry_id IS NOT NULL) + (release_id IS NOT NULL) + (part_id IS NOT NULL) + (file_card_id IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE INDEX `media_links_entry_idx` ON `media_links` (`entry_id`);--> statement-breakpoint
CREATE INDEX `media_links_media_idx` ON `media_links` (`media_id`);--> statement-breakpoint
CREATE TABLE `owned_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`release_id` text,
	`name` text NOT NULL,
	`ownership` text DEFAULT 'unconfirmed' NOT NULL,
	`condition` text DEFAULT 'Unknown' NOT NULL,
	`completeness` text DEFAULT 'Not sure' NOT NULL,
	`packaging` text DEFAULT 'unknown' NOT NULL,
	`sealed` integer,
	`reviewed_revision` integer,
	`private_notes` text DEFAULT '' NOT NULL,
	`location` text,
	`acquired_at` text,
	`purchase_price_cents` integer,
	`purchase_currency` text,
	`purchase_source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entry_ownership" CHECK(ownership IN ('owned','parts_only','unconfirmed')),
	CONSTRAINT "entry_condition" CHECK(condition IN ('Mint','Excellent','Good','Fair','Poor','Unknown')),
	CONSTRAINT "entry_completeness" CHECK(completeness IN ('Complete','Partial','Not sure')),
	CONSTRAINT "entry_packaging" CHECK(packaging IN ('present','absent','unknown')),
	CONSTRAINT "entry_complete_packaging" CHECK(completeness <> 'Complete' OR packaging = 'present'),
	CONSTRAINT "purchase_price_nonnegative" CHECK(purchase_price_cents IS NULL OR purchase_price_cents >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_id_release_unique` ON `owned_entries` (`id`,`release_id`);--> statement-breakpoint
CREATE INDEX `entries_collection_release_idx` ON `owned_entries` (`collection_id`,`release_id`);--> statement-breakpoint
CREATE TABLE `owned_parts` (
	`entry_id` text NOT NULL,
	`part_id` text NOT NULL,
	`release_id` text NOT NULL,
	`quantity` integer,
	`condition` text,
	`defects` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`entry_id`, `part_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `owned_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`part_id`,`release_id`) REFERENCES `catalog_parts`(`id`,`release_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`,`release_id`) REFERENCES `owned_entries`(`id`,`release_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "owned_quantity_nonnegative" CHECK(quantity IS NULL OR quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE `release_links` (
	`release_id` text NOT NULL,
	`related_id` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`release_id`, `related_id`, `kind`),
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "release_link_not_self" CHECK(release_id <> related_id)
);
--> statement-breakpoint
CREATE TABLE `release_taxonomy` (
	`release_id` text NOT NULL,
	`taxonomy_id` text NOT NULL,
	PRIMARY KEY(`release_id`, `taxonomy_id`),
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taxonomy_id`) REFERENCES `taxonomy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `taxonomy` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	FOREIGN KEY (`parent_id`) REFERENCES `taxonomy`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "taxonomy_not_self" CHECK(parent_id IS NULL OR parent_id <> id)
);
--> statement-breakpoint
CREATE TABLE `unidentified_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer,
	`condition` text,
	`defects` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `owned_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "unidentified_quantity_nonnegative" CHECK(quantity IS NULL OR quantity >= 0)
);
--> statement-breakpoint
CREATE INDEX `unidentified_entry_idx` ON `unidentified_parts` (`entry_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`granted_at` text NOT NULL,
	`granted_by` text NOT NULL,
	PRIMARY KEY(`user_id`, `role`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "role_admin_only" CHECK(role = 'admin')
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`deleted_at` text,
	`created_at` text NOT NULL
);
