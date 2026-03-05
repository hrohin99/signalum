import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { userProfiles, workspaces, captures, briefs, topicTypeConfigs, productContext, battlecards, type InsertUserProfile, type UserProfile, type InsertWorkspace, type Workspace, type InsertCapture, type Capture, type InsertBrief, type Brief, type InsertTopicTypeConfig, type TopicTypeConfig, type InsertProductContext, type ProductContext, type InsertBattlecard, type Battlecard } from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

export interface IStorage {
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  dismissWelcome(userId: string): Promise<void>;
  getWorkspaceByUserId(userId: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspaceCategories(userId: string, categories: any[]): Promise<Workspace | undefined>;
  createCapture(capture: InsertCapture): Promise<Capture>;
  getCapturesByUserId(userId: string): Promise<Capture[]>;
  createBrief(brief: InsertBrief): Promise<Brief>;
  getBriefsByUserId(userId: string): Promise<Brief[]>;
  getTopicTypeConfigs(tenantId: string): Promise<TopicTypeConfig[]>;
  createTopicTypeConfig(config: InsertTopicTypeConfig): Promise<TopicTypeConfig>;
  getProductContext(tenantId: string): Promise<ProductContext | undefined>;
  upsertProductContext(context: InsertProductContext): Promise<ProductContext>;
  getBattlecard(tenantId: string, entityId: string): Promise<Battlecard | undefined>;
  upsertBattlecard(tenantId: string, entityId: string, data: Partial<InsertBattlecard>): Promise<Battlecard>;
}

export class DatabaseStorage implements IStorage {
  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [created] = await db
      .insert(userProfiles)
      .values(profile)
      .returning();
    return created;
  }

  async dismissWelcome(userId: string): Promise<void> {
    await db
      .update(userProfiles)
      .set({ welcomeDismissed: 1 })
      .where(eq(userProfiles.userId, userId));
  }

  async getWorkspaceByUserId(userId: string): Promise<Workspace | undefined> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId));
    return workspace;
  }

  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    const [created] = await db
      .insert(workspaces)
      .values(workspace)
      .returning();
    return created;
  }

  async updateWorkspaceCategories(userId: string, categories: any[]): Promise<Workspace | undefined> {
    const [updated] = await db
      .update(workspaces)
      .set({ categories })
      .where(eq(workspaces.userId, userId))
      .returning();
    return updated;
  }

  async createCapture(capture: InsertCapture): Promise<Capture> {
    const [created] = await db
      .insert(captures)
      .values(capture)
      .returning();
    return created;
  }

  async getCapturesByUserId(userId: string): Promise<Capture[]> {
    return db
      .select()
      .from(captures)
      .where(eq(captures.userId, userId))
      .orderBy(desc(captures.createdAt));
  }

  async createBrief(brief: InsertBrief): Promise<Brief> {
    const [created] = await db
      .insert(briefs)
      .values(brief)
      .returning();
    return created;
  }

  async getBriefsByUserId(userId: string): Promise<Brief[]> {
    return db
      .select()
      .from(briefs)
      .where(eq(briefs.userId, userId))
      .orderBy(desc(briefs.createdAt));
  }

  async getTopicTypeConfigs(tenantId: string): Promise<TopicTypeConfig[]> {
    return db
      .select()
      .from(topicTypeConfigs)
      .where(eq(topicTypeConfigs.tenantId, tenantId))
      .orderBy(topicTypeConfigs.createdAt);
  }

  async createTopicTypeConfig(config: InsertTopicTypeConfig): Promise<TopicTypeConfig> {
    const [created] = await db
      .insert(topicTypeConfigs)
      .values(config)
      .returning();
    return created;
  }

  async getProductContext(tenantId: string): Promise<ProductContext | undefined> {
    const [context] = await db
      .select()
      .from(productContext)
      .where(eq(productContext.tenantId, tenantId));
    return context;
  }

  async upsertProductContext(context: InsertProductContext): Promise<ProductContext> {
    const existing = await this.getProductContext(context.tenantId);
    if (existing) {
      const [updated] = await db
        .update(productContext)
        .set({ ...context, updatedAt: new Date() })
        .where(eq(productContext.tenantId, context.tenantId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(productContext)
      .values(context)
      .returning();
    return created;
  }

  async getBattlecard(tenantId: string, entityId: string): Promise<Battlecard | undefined> {
    const [card] = await db
      .select()
      .from(battlecards)
      .where(and(eq(battlecards.tenantId, tenantId), eq(battlecards.entityId, entityId)));
    return card;
  }

  async upsertBattlecard(tenantId: string, entityId: string, data: Partial<InsertBattlecard>): Promise<Battlecard> {
    const existing = await this.getBattlecard(tenantId, entityId);
    if (existing) {
      const [updated] = await db
        .update(battlecards)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(battlecards.tenantId, tenantId), eq(battlecards.entityId, entityId)))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(battlecards)
      .values({ tenantId, entityId, ...data })
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
