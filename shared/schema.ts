import { pgTable, text, varchar, jsonb, timestamp, serial, integer, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  role: text("role"),
  onboardingContext: text("onboarding_context"),
  welcomeDismissed: integer("welcome_dismissed").default(0).notNull(),
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
  entities: ExtractedEntity[];
}

export interface ExtractedEntity {
  name: string;
  type: string;
  topic_type?: string;
  related_topic_ids?: string[];
  priority?: 'high' | 'medium' | 'low' | 'watch';
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
