import { sqliteTable, text, integer, index, primaryKey, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users, catalogReleases } from './target-schema';
export const discussionThreads = sqliteTable('discussion_threads', {
  id: text('id').primaryKey(), releaseId: text('release_id').references(() => catalogReleases.id),
  authorId: text('author_id').notNull().references(() => users.id), title: text('title').notNull(),
  locked: integer('locked').notNull().default(0), version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [index('threads_scope_time').on(t.releaseId,t.updatedAt,t.id), index('threads_time').on(t.updatedAt,t.id)]);
export const discussionPosts = sqliteTable('discussion_posts', {
  id: text('id').primaryKey(), threadId: text('thread_id').notNull().references(() => discussionThreads.id),
  authorId: text('author_id').notNull().references(() => users.id), body: text('body').notNull(),
  state: text('state').notNull().default('visible'), version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(), editedAt: text('edited_at'),
}, t => [index('posts_thread_time').on(t.threadId,t.createdAt,t.id), check('post_state',sql.raw("state IN ('visible','hidden','removed')"))]);
export const discussionRevisions = sqliteTable('discussion_revisions', {
  postId: text('post_id').notNull().references(() => discussionPosts.id), version: integer('version').notNull(), body: text('body').notNull(), createdAt:text('created_at').notNull(),
}, t => [primaryKey({columns:[t.postId,t.version]})]);
export const discussionFollows = sqliteTable('discussion_follows', {
  userId:text('user_id').notNull().references(() => users.id), threadId:text('thread_id').notNull().references(() => discussionThreads.id), createdAt:text('created_at').notNull(),
}, t => [primaryKey({columns:[t.userId,t.threadId]}),index('follows_thread').on(t.threadId)]);
export const discussionReports = sqliteTable('discussion_reports', {
  id:text('id').primaryKey(), postId:text('post_id').notNull().references(() => discussionPosts.id), reporterId:text('reporter_id').notNull().references(() => users.id),
  reason:text('reason').notNull(), resolved:integer('resolved').notNull().default(0), createdAt:text('created_at').notNull(),
}, t => [uniqueIndex('report_once').on(t.postId,t.reporterId),index('reports_queue').on(t.resolved,t.createdAt)]);
export const discussionRestrictions = sqliteTable('discussion_restrictions', {userId:text('user_id').primaryKey().references(() => users.id),createdAt:text('created_at').notNull()});
export const discussionModeration = sqliteTable('discussion_moderation', {
  id:text('id').primaryKey(), actorId:text('actor_id').notNull().references(() => users.id), targetId:text('target_id').notNull(), action:text('action').notNull(),reason:text('reason').notNull(),createdAt:text('created_at').notNull(),
});
export const discussionNotifications = sqliteTable('discussion_notifications', {
  userId:text('user_id').notNull().references(() => users.id),postId:text('post_id').notNull().references(() => discussionPosts.id),threadId:text('thread_id').notNull().references(() => discussionThreads.id),readAt:text('read_at'),createdAt:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.postId]}),index('notifications_user_time').on(t.userId,t.createdAt)]);
