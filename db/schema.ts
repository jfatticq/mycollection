import {sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const items=sqliteTable('items',{id:text('id').primaryKey(),data:text('data').notNull()});
export const settings=sqliteTable('settings',{id:text('id').primaryKey(),data:text('data').notNull()});
export const catalogIssues=sqliteTable('catalog_issues',{id:text('id').primaryKey(),data:text('data').notNull()});
export const catalogChecks=sqliteTable('catalog_checks',{id:text('id').primaryKey(),data:text('data').notNull()});
