import { db, pool } from "./storage";
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
        url_category TEXT NOT NULL DEFAULT 'custom',
        check_frequency TEXT NOT NULL DEFAULT 'daily',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("[DBSafety] monitored_urls table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring monitored_urls table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      ALTER TABLE monitored_urls ADD COLUMN IF NOT EXISTS url_category TEXT NOT NULL DEFAULT 'custom';
      ALTER TABLE monitored_urls ADD COLUMN IF NOT EXISTS check_frequency TEXT NOT NULL DEFAULT 'daily';
    `);
    console.log("[DBSafety] monitored_urls columns verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring monitored_urls columns:", error?.message || error);
  }

  try {
    await db.execute(sql`ALTER TABLE monitored_urls DROP COLUMN IF EXISTS is_active`);
  } catch (error: any) {
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

  try {
    await db.execute(sql`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS briefing_enabled boolean DEFAULT false;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS briefing_day varchar(10) DEFAULT 'monday';
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS briefing_time varchar(5) DEFAULT '08:00';
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS briefing_email varchar(255);
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS briefing_last_sent timestamp;
    `);
    console.log("[DBSafety] briefing columns verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring briefing columns:", error?.message || error);
  }

  try {
    await db.execute(sql`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_perspective TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tracking_types TEXT[];
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tracking_intent TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS org_description TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS org_market TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS org_geographies TEXT[];
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS org_size TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_role TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS competitors TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS win_factors TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS vulnerability TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS early_warning_signal TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS regulations_monitored TEXT[];
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS regulatory_bodies TEXT[];
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS compliance_purpose TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS standards_bodies TEXT[];
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS standards_certified TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS standards_purpose TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS briefing_audience TEXT;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
    `);
    console.log("[DBSafety] workspace profile columns verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring workspace profile columns:", error?.message || error);
  }

  try {
    await pool.query(`
      ALTER TABLE captures ADD COLUMN IF NOT EXISTS extracted_excerpt TEXT;
      ALTER TABLE captures ADD COLUMN IF NOT EXISTS suggested_new_category TEXT;
      ALTER TABLE captures ADD COLUMN IF NOT EXISTS suggested_new_category_reason TEXT;
    `);
    console.log("[DBSafety] captures AI columns verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring workspace profile columns:", error?.message || error);
  }

  try {
    await pool.query(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS parent_workspace_id UUID;
    `);
    console.log("[DBSafety] parent_workspace_id column verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring parent_workspace_id column:", error?.message || error);
  }

  try {
    await pool.query(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS digest_recipients JSONB DEFAULT '[]'
    `);
    console.log("[DBSafety] digest_recipients column verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring digest_recipients column:", error?.message || error);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entity_partnerships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        partner_name TEXT NOT NULL,
        partner_industry TEXT,
        partner_country TEXT,
        relationship_type TEXT NOT NULL,
        program_description TEXT,
        active_since TEXT,
        context_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DBSafety] entity_partnerships table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_partnerships table:", error?.message || error);
  }

  console.log("[DBSafety] All database schema safety checks complete.");
}
