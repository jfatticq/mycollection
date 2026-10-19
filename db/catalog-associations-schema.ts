import {sqliteTable,text,integer,index,foreignKey} from 'drizzle-orm/sqlite-core';
import {catalogReleases,catalogParts} from './target-schema';
export const releaseCharacters=sqliteTable('release_characters',{
 id:text('id').primaryKey(),releaseId:text('release_id').notNull().references(()=>catalogReleases.id),name:text('name').notNull(),partId:text('part_id'),sortOrder:integer('sort_order').notNull().default(0),
},t=>[index('characters_release').on(t.releaseId),index('characters_name').on(t.name),foreignKey({columns:[t.partId,t.releaseId],foreignColumns:[catalogParts.id,catalogParts.releaseId]})]);
