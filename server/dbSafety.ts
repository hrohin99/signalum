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
    await db.execute(sql`
      ALTER TABLE captures ADD COLUMN IF NOT EXISTS extracted_excerpt TEXT;
      ALTER TABLE captures ADD COLUMN IF NOT EXISTS suggested_new_category TEXT;
      ALTER TABLE captures ADD COLUMN IF NOT EXISTS suggested_new_category_reason TEXT;
    `);
    console.log("[DBSafety] captures AI columns verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring workspace profile columns:", error?.message || error);
  }

  try {
    await db.execute(sql`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS parent_workspace_id UUID;
    `);
    console.log("[DBSafety] parent_workspace_id column verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring parent_workspace_id column:", error?.message || error);
  }

  try {
    await db.execute(sql`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS digest_recipients JSONB DEFAULT '[]'
    `);
    console.log("[DBSafety] digest_recipients column verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring digest_recipients column:", error?.message || error);
  }

  try {
    await db.execute(sql`
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

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_intelligence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        field TEXT NOT NULL,
        content TEXT,
        is_custom BOOLEAN DEFAULT false,
        last_generated_at TIMESTAMPTZ,
        last_edited_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(workspace_id, entity_id, field)
      )
    `);
    console.log("[DBSafety] entity_intelligence table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_intelligence table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_capabilities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        capability_name TEXT NOT NULL,
        capability_description TEXT,
        competitor_has BOOLEAN,
        us_has BOOLEAN,
        assessment TEXT,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DBSafety] entity_capabilities table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_capabilities table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_certifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        cert_name TEXT NOT NULL,
        cert_description TEXT,
        status TEXT DEFAULT 'active',
        renewal_date TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DBSafety] entity_certifications table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_certifications table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'ga',
        tags TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DBSafety] entity_products table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_products table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_geo_presence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        region TEXT NOT NULL,
        country_code TEXT,
        iso_code TEXT,
        presence_type TEXT DEFAULT 'active',
        channel TEXT,
        channels TEXT,
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DBSafety] entity_geo_presence table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_geo_presence table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_win_loss (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        deal_name TEXT NOT NULL,
        description TEXT,
        quarter TEXT,
        sector TEXT,
        est_arr TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DBSafety] entity_win_loss table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_win_loss table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_funding (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        total_raised TEXT,
        stage TEXT,
        founded TEXT,
        status TEXT DEFAULT 'Private',
        round_name TEXT,
        round_amount TEXT,
        round_lead TEXT,
        round_year TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[DBSafety] entity_funding table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_funding table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_swot (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        entity_id TEXT NOT NULL,
        strengths TEXT,
        weaknesses TEXT,
        opportunities TEXT,
        threats TEXT,
        ai_generated BOOLEAN DEFAULT false,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(workspace_id, entity_id)
      )
    `);
    console.log("[DBSafety] entity_swot table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring entity_swot table:", error?.message || error);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS strategic_pulse (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        big_shift JSONB,
        emerging_opportunities JSONB,
        threat_radar JSONB,
        competitor_moves JSONB,
        watch_list JSONB,
        capture_count INTEGER DEFAULT 0,
        model TEXT DEFAULT 'claude-sonnet-4-20250514'
      )
    `);
    console.log("[DBSafety] strategic_pulse table verified.");
  } catch (error: any) {
    console.error("[DBSafety] Error ensuring strategic_pulse table:", error?.message || error);
  }

  console.log("[DBSafety] All database schema safety checks complete.");
}
