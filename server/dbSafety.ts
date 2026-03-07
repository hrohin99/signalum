import { db } from "./storage";
import { sql } from "drizzle-orm";

export async function ensureDatabaseSchema(): Promise<void> {
  console.log("[DBSafety] Running database schema safety checks...");

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workspace_context (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID NOT NULL UNIQUE,
        primary_domain TEXT,
        relevant_subtopics JSONB DEFAULT '[]'::jsonb,
        domain_keywords JSONB DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("[DBSafety] workspace_context table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring workspace_context table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS topic_dates (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        label TEXT NOT NULL,
        date DATE NOT NULL,
        date_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'upcoming',
        source TEXT NOT NULL DEFAULT 'manual',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("[DBSafety] topic_dates table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring topic_dates table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS monitored_urls (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        url TEXT NOT NULL,
        label TEXT,
        last_checked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("[DBSafety] monitored_urls table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring monitored_urls table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'topic_dates_entity_id_idx') THEN
          CREATE INDEX topic_dates_entity_id_idx ON topic_dates (entity_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'topic_dates_date_idx') THEN
          CREATE INDEX topic_dates_date_idx ON topic_dates (date);
        END IF;
      END $$
    `);
    console.log("[DBSafety] topic_dates indexes verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring topic_dates indexes:", error?.message || error);
  }

  try {
    await db.execute(sql`
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weekly_digest_enabled INTEGER NOT NULL DEFAULT 0
    `);
    console.log("[DBSafety] weekly_digest_enabled column verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring weekly_digest_enabled column:", error?.message || error);
  }

  console.log("[DBSafety] All database schema safety checks complete.");
}
