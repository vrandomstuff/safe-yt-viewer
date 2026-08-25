import {
	boolean,
	pgTable,
	timestamp,
	varchar,
	PgColumn
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export function contains(col: PgColumn, value: string) {
	return sql`strpos(lower(${col}), lower(${value})) > 0`;
}

export const pins = pgTable("pins", {
	videoId: varchar({ length: 11 }).notNull().primaryKey()
});
export const channels = pgTable("channels", {
	name: varchar({ length: 255 }).notNull(),
	channelId: varchar({ length: 24 }).notNull().primaryKey(),
	handle: varchar({ length: 255 }).notNull().unique(),
	avatarUrl: varchar({ length: 255 }).notNull(),
	fullyAllowed: boolean().notNull()
});
export const tokens = pgTable("tokens", {
	token: varchar({ length: 64 }).notNull().primaryKey()
});
export const avatarCache = pgTable("avatarCache", {
	// Cache for getAvatarUrl because it takes SOOOOO long
	channelId: varchar({ length: 24 }).notNull().primaryKey(),
	avatarUrl: varchar({ length: 255 }).notNull(),
	cachedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});
export const channelMetadataCache = pgTable("channelMetadataCache", {
	handle: varchar({ length: 255 }).notNull().primaryKey(),
	channelId: varchar({ length: 24 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	cachedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});
export const videoCache = pgTable("videoCache", {
	videoId: varchar({ length: 11 }).notNull().primaryKey(),
	uploaderId: varchar({ length: 255 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	thumbnailURL: varchar({ length: 255 }).notNull().unique(),
	publishedAt: timestamp({ withTimezone: true }).notNull(),
	cachedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

export const watchData = pgTable("watchData", {
	videoId: varchar({ length: 11 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	eventDate: timestamp({ withTimezone: true })
		.notNull()
		.primaryKey()
		.defaultNow()
});

// Videos here are allowed even when the uploader is not allowed
export const whitelist = pgTable("whitelist", {
	videoId: varchar({ length: 11 }).notNull().primaryKey()
});

// Videos here are blocked even when the uploader is allowed
export const blacklist = pgTable("blacklist", {
	videoId: varchar({ length: 11 }).notNull().primaryKey()
});
