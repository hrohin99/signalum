import { pgTable, text, varchar, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
}

export interface ExtractionResult {
  categories: ExtractedCategory[];
  summary: string;
}
