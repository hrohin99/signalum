import { pgTable, text, varchar, jsonb, timestamp, serial, integer, uuid, unique, date, index, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  role: text("role"),
  onboardingContext: text("onboarding_context"),
  welcomeDismissed: integer("welcome_dismissed").default(0).notNull(),
  historicalSeedingCompleted: integer("historical_seeding_completed").default(0).notNull(),
  workspaceReady: integer("workspace_ready").default(0).notNull(),
  weeklyDigestEnabled: integer("weekly_digest_enabled").default(0).notNull(),
  cityCountry: text("city_country"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
});

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export const workspaces = pgTable("workspaces", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  categories: jsonb("categories").notNull().$type<ExtractedCategory[]>(),
  websiteUrl: text("website_url"),
  pendingSeedUrls: jsonb("pending_seed_urls").$type<string[]>(),
  captureToken: varchar("capture_token", { length: 32 }).unique(),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  createdAt: true,
});

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

export const captures = pgTable("captures", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  content: text("content").notNull(),
  matchedEntity: text("matched_entity"),
  matchedCategory: text("matched_category"),
  matchReason: text("match_reason"),
  extractedExcerpt: text("extracted_excerpt"),
  suggestedNewCategory: text("suggested_new_category"),
  suggestedNewCategoryReason: text("suggested_new_category_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCaptureSchema = createInsertSchema(captures).omit({
  id: true,
  createdAt: true,
});

export type InsertCapture = z.infer<typeof insertCaptureSchema>;
export type Capture = typeof captures.$inferSelect;

export const onboardingInputSchema = z.object({
  description: z.string().min(10, "Please describe what you want to track in at least a few words"),
});

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

export interface ExtractedCategory {
  name: string;
  description: string;
  focus?: string;
  entities: ExtractedEntity[];
}

export interface ExtractedEntity {
  name: string;
  type: string;
  topic_type?: string;
  related_topic_ids?: string[];
  priority?: 'high' | 'medium' | 'low' | 'watch';
  auto_search_enabled?: boolean;
  alert_on_high_signal?: boolean;
  aiSummary?: string;
  aiSummaryUpdatedAt?: string;
  disambiguation_confirmed?: boolean;
  disambiguation_context?: string;
  company_industry?: string;
  domain_keywords?: string[];
  needs_aspect_review?: boolean;
  entity_type_detected?: string;
  pricing_model_detected?: string;
  website_url?: string;
  soWhatText?: string;
  soWhatGeneratedAt?: string;
  funding?: any;
  geo_presence?: any;
  products?: any;
  last_researched_at?: string;
}

export interface ExtractionResult {
  categories: ExtractedCategory[];
  summary: string;
}

export const briefs = pgTable("briefs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  content: text("content").notNull(),
  captureCount: integer("capture_count").notNull(),
  entityCount: integer("entity_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBriefSchema = createInsertSchema(briefs).omit({
  id: true,
  createdAt: true,
});

export type InsertBrief = z.infer<typeof insertBriefSchema>;
export type Brief = typeof briefs.$inferSelect;

export const topicTypeConfigs = pgTable("topic_type_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  typeKey: text("type_key").notNull(),
  displayName: text("display_name").notNull(),
  icon: text("icon").notNull(),
  description: text("description").notNull(),
  aiPromptHint: text("ai_prompt_hint").notNull(),
  widgetConfig: jsonb("widget_config").notNull().$type<{ widgets: string[] }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("topic_type_configs_tenant_type_key").on(table.tenantId, table.typeKey),
]);

export const insertTopicTypeConfigSchema = createInsertSchema(topicTypeConfigs).omit({
  id: true,
  createdAt: true,
});

export type InsertTopicTypeConfig = z.infer<typeof insertTopicTypeConfigSchema>;
export type TopicTypeConfig = typeof topicTypeConfigs.$inferSelect;

export const battlecards = pgTable("battlecards", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  entityId: text("entity_id").notNull(),
  whatTheyDo: text("what_they_do"),
  strengths: jsonb("strengths").$type<string[]>().default([]),
  weaknesses: jsonb("weaknesses").$type<string[]>().default([]),
  howToBeat: jsonb("how_to_beat").$type<string[]>().default([]),
  lastAiGeneratedAt: timestamp("last_ai_generated_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("battlecards_tenant_entity").on(table.tenantId, table.entityId),
]);

export const insertBattlecardSchema = createInsertSchema(battlecards).omit({
  id: true,
  updatedAt: true,
});

export type InsertBattlecard = z.infer<typeof insertBattlecardSchema>;
export type Battlecard = typeof battlecards.$inferSelect;

export const productContext = pgTable("product_context", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  productName: text("product_name").notNull(),
  description: text("description"),
  targetCustomer: text("target_customer"),
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProductContextSchema = createInsertSchema(productContext).omit({
  id: true,
  updatedAt: true,
});

export type InsertProductContext = z.infer<typeof insertProductContextSchema>;
export type ProductContext = typeof productContext.$inferSelect;

export const topicDates = pgTable("topic_dates", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  entityId: text("entity_id").notNull(),
  label: text("label").notNull(),
  date: date("date").notNull(),
  dateType: text("date_type").notNull(),
  status: text("status").notNull().default("upcoming"),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("topic_dates_entity_id_idx").on(table.entityId),
  index("topic_dates_date_idx").on(table.date),
]);

export const insertTopicDateSchema = createInsertSchema(topicDates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTopicDate = z.infer<typeof insertTopicDateSchema>;
export type TopicDate = typeof topicDates.$inferSelect;

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  entityName: text("entity_name").notNull(),
  categoryName: text("category_name"),
  type: text("type").notNull().default("high_signal"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  signalStrength: text("signal_strength").notNull().default("high"),
  read: integer("read").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_tenant_id_idx").on(table.tenantId),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const workspaceContext = pgTable("workspace_context", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().unique(),
  primaryDomain: text("primary_domain"),
  relevantSubtopics: jsonb("relevant_subtopics").$type<string[]>().default([]),
  domainKeywords: jsonb("domain_keywords").$type<string[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWorkspaceContextSchema = createInsertSchema(workspaceContext).omit({
  id: true,
  updatedAt: true,
});

export type InsertWorkspaceContext = z.infer<typeof insertWorkspaceContextSchema>;
export type WorkspaceContext = typeof workspaceContext.$inferSelect;

export interface SiblingInferenceResult {
  inferred_domain: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export const monitoredUrls = pgTable("monitored_urls", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  entityId: text("entity_id").notNull(),
  url: text("url").notNull(),
  urlCategory: text("url_category").notNull(),
  checkFrequency: text("check_frequency").notNull().default("daily"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("monitored_urls_entity_id_idx").on(table.entityId),
]);

export const insertMonitoredUrlSchema = createInsertSchema(monitoredUrls).omit({
  id: true,
  createdAt: true,
});

export type InsertMonitoredUrl = z.infer<typeof insertMonitoredUrlSchema>;
export type MonitoredUrl = typeof monitoredUrls.$inferSelect;

export const featureInterest = pgTable("feature_interest", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  featureName: text("feature_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("feature_interest_user_feature").on(table.userId, table.featureName),
]);

export const insertFeatureInterestSchema = createInsertSchema(featureInterest).omit({
  id: true,
  createdAt: true,
});

export type InsertFeatureInterest = z.infer<typeof insertFeatureInterestSchema>;
export type FeatureInterest = typeof featureInterest.$inferSelect;

export const feedback = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  mood: text("mood").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

export const workspaceCapabilities = pgTable("workspace_capabilities", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("workspace_capabilities_tenant_id_idx").on(table.tenantId),
]);

export const insertWorkspaceCapabilitySchema = createInsertSchema(workspaceCapabilities).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkspaceCapability = z.infer<typeof insertWorkspaceCapabilitySchema>;
export type WorkspaceCapability = typeof workspaceCapabilities.$inferSelect;

export const competitorCapabilities = pgTable("competitor_capabilities", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  entityId: text("entity_id").notNull(),
  capabilityId: uuid("capability_id").notNull(),
  status: text("status").notNull().default("unknown"),
  evidence: text("evidence"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("competitor_capabilities_entity_capability").on(table.entityId, table.capabilityId),
  index("competitor_capabilities_tenant_id_idx").on(table.tenantId),
  index("competitor_capabilities_entity_id_idx").on(table.entityId),
]);

export const insertCompetitorCapabilitySchema = createInsertSchema(competitorCapabilities).omit({
  id: true,
  updatedAt: true,
});

export type InsertCompetitorCapability = z.infer<typeof insertCompetitorCapabilitySchema>;
export type CompetitorCapability = typeof competitorCapabilities.$inferSelect;

export const competitorPricing = pgTable("competitor_pricing", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  entityId: text("entity_id").notNull(),
  capturedDate: date("captured_date").notNull(),
  planName: text("plan_name").notNull(),
  price: text("price").notNull(),
  inclusions: text("inclusions"),
  sourceUrl: text("source_url"),
  pricingModel: text("pricing_model"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("competitor_pricing_entity_id_idx").on(table.entityId),
  index("competitor_pricing_tenant_id_idx").on(table.tenantId),
]);

export const insertCompetitorPricingSchema = createInsertSchema(competitorPricing).omit({
  id: true,
  createdAt: true,
});

export type InsertCompetitorPricing = z.infer<typeof insertCompetitorPricingSchema>;
export type CompetitorPricing = typeof competitorPricing.$inferSelect;

export const strategicDirections = pgTable("strategic_directions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  entityId: text("entity_id").notNull(),
  whereHeading: text("where_heading"),
  whatMeansForYou: text("what_means_for_you"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("strategic_directions_tenant_entity").on(table.tenantId, table.entityId),
]);

export const insertStrategicDirectionSchema = createInsertSchema(strategicDirections).omit({
  id: true,
  updatedAt: true,
});

export type InsertStrategicDirection = z.infer<typeof insertStrategicDirectionSchema>;
export type StrategicDirection = typeof strategicDirections.$inferSelect;

export const entitySeoData = pgTable("entity_seo_data", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  entityId: text("entity_id").notNull(),
  rankedKeywords: jsonb("ranked_keywords").$type<{ keyword: string; position: number; search_volume: number }[]>().default([]),
  localPackPosition: integer("local_pack_position"),
  localPackResults: jsonb("local_pack_results").$type<{ title: string; position: number; rating?: number; reviews?: number }[]>().default([]),
  businessRating: numeric("business_rating"),
  reviewCount: integer("review_count"),
  businessAddress: text("business_address"),
  businessPhone: text("business_phone"),
  businessHours: text("business_hours"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
}, (table) => [
  unique("entity_seo_data_user_entity").on(table.userId, table.entityId),
  index("entity_seo_data_entity_id_idx").on(table.entityId),
]);

export const insertEntitySeoDataSchema = createInsertSchema(entitySeoData).omit({
  id: true,
  lastUpdated: true,
});

export type InsertEntitySeoData = z.infer<typeof insertEntitySeoDataSchema>;
export type EntitySeoData = typeof entitySeoData.$inferSelect;

export const ambientSearchLogs = pgTable("ambient_search_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  entitiesSearched: integer("entities_searched").notNull().default(0),
  newCapturesCreated: integer("new_captures_created").notNull().default(0),
  notificationsCreated: integer("notifications_created").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});
