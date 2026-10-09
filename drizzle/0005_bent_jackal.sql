CREATE TABLE `discussion_follows` (
	`user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `thread_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `discussion_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `follows_thread` ON `discussion_follows` (`thread_id`);--> statement-breakpoint
CREATE TABLE `discussion_moderation` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `discussion_notifications` (
	`user_id` text NOT NULL,
	`post_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `post_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `discussion_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `discussion_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user_time` ON `discussion_notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `discussion_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`state` text DEFAULT 'visible' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`edited_at` text,
	FOREIGN KEY (`thread_id`) REFERENCES `discussion_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "post_state" CHECK(state IN ('visible','hidden','removed'))
);
--> statement-breakpoint
CREATE INDEX `posts_thread_time` ON `discussion_posts` (`thread_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `discussion_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `discussion_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_once` ON `discussion_reports` (`post_id`,`reporter_id`);--> statement-breakpoint
CREATE INDEX `reports_queue` ON `discussion_reports` (`resolved`,`created_at`);--> statement-breakpoint
CREATE TABLE `discussion_restrictions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `discussion_revisions` (
	`post_id` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `version`),
	FOREIGN KEY (`post_id`) REFERENCES `discussion_posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `discussion_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `threads_scope_time` ON `discussion_threads` (`release_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `threads_time` ON `discussion_threads` (`updated_at`,`id`);