import { eq, desc, and, lt, gte, sql, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { userProfiles, workspaces, captures, briefs, topicTypeConfigs, productContext, battlecards, topicDates, notifications, ambientSearchLogs, workspaceContext, monitoredUrls, featureInterest, feedback, workspaceCapabilities, competitorCapabilities, competitorPricing, strategicDirections, type InsertUserProfile, type UserProfile, type InsertWorkspace, type Workspace, type InsertCapture, type Capture, type InsertBrief, type Brief, type InsertTopicTypeConfig, type TopicTypeConfig, type InsertProductContext, type ProductContext, type InsertBattlecard, type Battlecard, type InsertTopicDate, type TopicDate, type InsertNotification, type Notification, type InsertWorkspaceContext, type WorkspaceContext, type InsertMonitoredUrl, type MonitoredUrl, type InsertFeatureInterest, type FeatureInterest, type InsertFeedback, type Feedback, type InsertWorkspaceCapability, type WorkspaceCapability, type InsertCompetitorCapability, type CompetitorCapability, type InsertCompetitorPricing, type CompetitorPricing, type InsertStrategicDirection, type StrategicDirection } from "@shared/schema";

export const pool = new pg.Pool({
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
  deleteCapturesByEntity(userId: string, entityName: string, categoryName: string): Promise<number>;
  getTopicDatesByEntity(tenantId: string, entityId: string): Promise<TopicDate[]>;
  getAllTopicDates(tenantId: string): Promise<TopicDate[]>;
  createTopicDate(data: InsertTopicDate): Promise<TopicDate>;
  updateTopicDate(id: string, tenantId: string, entityId: string, data: Partial<InsertTopicDate>): Promise<TopicDate | undefined>;
  deleteTopicDate(id: string, tenantId: string, entityId: string): Promise<boolean>;
  markHistoricalSeedingCompleted(userId: string): Promise<void>;
  isHistoricalSeedingCompleted(userId: string): Promise<boolean>;
  createCaptures(capturesData: InsertCapture[]): Promise<Capture[]>;
  getCapturesByEntitySince(userId: string, entityName: string, since: Date): Promise<Capture[]>;
  getAllWorkspaces(): Promise<Workspace[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUserId(userId: string): Promise<Notification[]>;
  createAmbientSearchLog(log: { tenantId: string; userId: string; entitiesSearched: number; newCapturesCreated: number; notificationsCreated: number; errors: number }): Promise<void>;
  updateEntityAiSummary(userId: string, entityName: string, summary: string): Promise<void>;
  flagCapturesForBrief(captureIds: number[]): Promise<void>;
  setWorkspaceReady(userId: string): Promise<void>;
  isWorkspaceReady(userId: string): Promise<boolean>;
  getWorkspaceContext(tenantId: string): Promise<WorkspaceContext | undefined>;
  upsertWorkspaceContext(data: InsertWorkspaceContext): Promise<WorkspaceContext>;
  getMonitoredUrlsByEntity(tenantId: string, entityId: string): Promise<MonitoredUrl[]>;
  createMonitoredUrl(data: InsertMonitoredUrl): Promise<MonitoredUrl>;
  deleteMonitoredUrl(id: string, tenantId: string, entityId: string): Promise<boolean>;
  createFeatureInterest(data: InsertFeatureInterest): Promise<FeatureInterest>;
  getFeatureInterestByUser(userId: string): Promise<FeatureInterest[]>;
  createFeedback(data: InsertFeedback): Promise<Feedback>;
  getAllFeedback(): Promise<Feedback[]>;
  getAllFeatureInterest(): Promise<FeatureInterest[]>;
  getAllUserProfiles(): Promise<UserProfile[]>;
  getTopicCountByUser(userId: string): Promise<number>;
  getCaptureCountByUser(userId: string): Promise<number>;
  updateWeeklyDigest(userId: string, enabled: boolean): Promise<void>;
  getUsersWithWeeklyDigest(): Promise<UserProfile[]>;
  getWorkspaceCapabilities(tenantId: string): Promise<WorkspaceCapability[]>;
  createWorkspaceCapability(data: InsertWorkspaceCapability): Promise<WorkspaceCapability>;
  updateWorkspaceCapability(id: string, tenantId: string, data: Partial<InsertWorkspaceCapability>): Promise<WorkspaceCapability | undefined>;
  deleteWorkspaceCapability(id: string, tenantId: string): Promise<boolean>;
  reorderWorkspaceCapabilities(tenantId: string, orderedIds: string[]): Promise<void>;
  getCompetitorCapabilities(tenantId: string, entityId: string): Promise<CompetitorCapability[]>;
  getAllCompetitorCapabilities(tenantId: string): Promise<CompetitorCapability[]>;
  upsertCompetitorCapability(tenantId: string, entityId: string, capabilityId: string, status: string, evidence?: string | null): Promise<CompetitorCapability>;
  getCompetitorPricing(tenantId: string, entityId: string): Promise<CompetitorPricing[]>;
  createCompetitorPricing(data: InsertCompetitorPricing): Promise<CompetitorPricing>;
  deleteCompetitorPricing(id: string, tenantId: string, entityId: string): Promise<boolean>;
  getStrategicDirection(tenantId: string, entityId: string): Promise<StrategicDirection | undefined>;
  upsertStrategicDirection(tenantId: string, entityId: string, data: { whereHeading?: string | null; whatMeansForYou?: string | null }): Promise<StrategicDirection>;
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
  async deleteCapturesByEntity(userId: string, entityName: string, categoryName: string): Promise<number> {
    const deleted = await db
      .delete(captures)
      .where(and(eq(captures.userId, userId), eq(captures.matchedEntity, entityName), eq(captures.matchedCategory, categoryName)))
      .returning();
    return deleted.length;
  }

  async getTopicDatesByEntity(tenantId: string, entityId: string): Promise<TopicDate[]> {
    await db
      .update(topicDates)
      .set({ status: "overdue", updatedAt: new Date() })
      .where(
        and(
          eq(topicDates.tenantId, tenantId),
          eq(topicDates.entityId, entityId),
          eq(topicDates.status, "upcoming"),
          lt(topicDates.date, sql`CURRENT_DATE`)
        )
      );

    return db
      .select()
      .from(topicDates)
      .where(and(eq(topicDates.tenantId, tenantId), eq(topicDates.entityId, entityId)))
      .orderBy(topicDates.date);
  }

  async getAllTopicDates(tenantId: string): Promise<TopicDate[]> {
    await db
      .update(topicDates)
      .set({ status: "overdue", updatedAt: new Date() })
      .where(
        and(
          eq(topicDates.tenantId, tenantId),
          eq(topicDates.status, "upcoming"),
          lt(topicDates.date, sql`CURRENT_DATE`)
        )
      );

    return db
      .select()
      .from(topicDates)
      .where(eq(topicDates.tenantId, tenantId))
      .orderBy(topicDates.date);
  }

  async createTopicDate(data: InsertTopicDate): Promise<TopicDate> {
    const [created] = await db
      .insert(topicDates)
      .values(data)
      .returning();
    return created;
  }

  async updateTopicDate(id: string, tenantId: string, entityId: string, data: Partial<InsertTopicDate>): Promise<TopicDate | undefined> {
    const [updated] = await db
      .update(topicDates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(topicDates.id, id), eq(topicDates.tenantId, tenantId), eq(topicDates.entityId, entityId)))
      .returning();
    return updated;
  }

  async deleteTopicDate(id: string, tenantId: string, entityId: string): Promise<boolean> {
    const deleted = await db
      .delete(topicDates)
      .where(and(eq(topicDates.id, id), eq(topicDates.tenantId, tenantId), eq(topicDates.entityId, entityId)))
      .returning();
    return deleted.length > 0;
  }

  async markHistoricalSeedingCompleted(userId: string): Promise<void> {
    await db
      .update(userProfiles)
      .set({ historicalSeedingCompleted: 1 })
      .where(eq(userProfiles.userId, userId));
  }

  async isHistoricalSeedingCompleted(userId: string): Promise<boolean> {
    const profile = await this.getUserProfile(userId);
    return profile?.historicalSeedingCompleted === 1;
  }

  async createCaptures(capturesData: InsertCapture[]): Promise<Capture[]> {
    if (capturesData.length === 0) return [];
    return db
      .insert(captures)
      .values(capturesData)
      .returning();
  }

  async getCapturesByEntitySince(userId: string, entityName: string, since: Date): Promise<Capture[]> {
    return db
      .select()
      .from(captures)
      .where(and(
        eq(captures.userId, userId),
        eq(captures.matchedEntity, entityName),
        gte(captures.createdAt, since)
      ))
      .orderBy(desc(captures.createdAt));
  }

  async getAllWorkspaces(): Promise<Workspace[]> {
    return db.select().from(workspaces);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return created;
  }

  async getNotificationsByUserId(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createAmbientSearchLog(log: { tenantId: string; userId: string; entitiesSearched: number; newCapturesCreated: number; notificationsCreated: number; errors: number }): Promise<void> {
    await db.insert(ambientSearchLogs).values(log);
  }

  async updateEntityAiSummary(userId: string, entityName: string, summary: string): Promise<void> {
    const workspace = await this.getWorkspaceByUserId(userId);
    if (!workspace) return;

    const categories = workspace.categories as any[];
    let updated = false;
    for (const category of categories) {
      for (const entity of category.entities) {
        if (entity.name === entityName) {
          entity.aiSummary = summary;
          entity.aiSummaryUpdatedAt = new Date().toISOString();
          updated = true;
          break;
        }
      }
      if (updated) break;
    }

    if (updated) {
      await this.updateWorkspaceCategories(userId, categories);
    }
  }

  async flagCapturesForBrief(captureIds: number[]): Promise<void> {
    if (captureIds.length === 0) return;
    for (const id of captureIds) {
      await db
        .update(captures)
        .set({ matchReason: sql`COALESCE(${captures.matchReason}, '') || ' [FLAGGED_FOR_BRIEF]'` })
        .where(eq(captures.id, id));
    }
  }

  async setWorkspaceReady(userId: string): Promise<void> {
    await db
      .update(userProfiles)
      .set({ workspaceReady: 1 })
      .where(eq(userProfiles.userId, userId));
  }

  async isWorkspaceReady(userId: string): Promise<boolean> {
    const profile = await this.getUserProfile(userId);
    return profile?.workspaceReady === 1;
  }

  async getWorkspaceContext(tenantId: string): Promise<WorkspaceContext | undefined> {
    const [context] = await db
      .select()
      .from(workspaceContext)
      .where(eq(workspaceContext.tenantId, tenantId));
    return context;
  }

  async upsertWorkspaceContext(data: InsertWorkspaceContext): Promise<WorkspaceContext> {
    const existing = await this.getWorkspaceContext(data.tenantId);
    if (existing) {
      const [updated] = await db
        .update(workspaceContext)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(workspaceContext.tenantId, data.tenantId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(workspaceContext)
      .values(data)
      .returning();
    return created;
  }
  async getMonitoredUrlsByEntity(tenantId: string, entityId: string): Promise<MonitoredUrl[]> {
    return db
      .select()
      .from(monitoredUrls)
      .where(and(eq(monitoredUrls.tenantId, tenantId), eq(monitoredUrls.entityId, entityId)))
      .orderBy(desc(monitoredUrls.createdAt));
  }

  async createMonitoredUrl(data: InsertMonitoredUrl): Promise<MonitoredUrl> {
    const [created] = await db
      .insert(monitoredUrls)
      .values(data)
      .returning();
    return created;
  }

  async deleteMonitoredUrl(id: string, tenantId: string, entityId: string): Promise<boolean> {
    const deleted = await db
      .delete(monitoredUrls)
      .where(and(eq(monitoredUrls.id, id), eq(monitoredUrls.tenantId, tenantId), eq(monitoredUrls.entityId, entityId)))
      .returning();
    return deleted.length > 0;
  }

  async createFeatureInterest(data: InsertFeatureInterest): Promise<FeatureInterest> {
    const [created] = await db
      .insert(featureInterest)
      .values(data)
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [existing] = await db
        .select()
        .from(featureInterest)
        .where(and(eq(featureInterest.userId, data.userId), eq(featureInterest.featureName, data.featureName)));
      return existing;
    }
    return created;
  }

  async getFeatureInterestByUser(userId: string): Promise<FeatureInterest[]> {
    return db
      .select()
      .from(featureInterest)
      .where(eq(featureInterest.userId, userId));
  }

  async createFeedback(data: InsertFeedback): Promise<Feedback> {
    const [created] = await db
      .insert(feedback)
      .values(data)
      .returning();
    return created;
  }

  async getAllFeedback(): Promise<Feedback[]> {
    return db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt));
  }

  async getAllFeatureInterest(): Promise<FeatureInterest[]> {
    return db
      .select()
      .from(featureInterest)
      .orderBy(desc(featureInterest.createdAt));
  }

  async getAllUserProfiles(): Promise<UserProfile[]> {
    return db
      .select()
      .from(userProfiles)
      .orderBy(desc(userProfiles.createdAt));
  }

  async getTopicCountByUser(userId: string): Promise<number> {
    const workspace = await this.getWorkspaceByUserId(userId);
    if (!workspace || !workspace.categories) return 0;
    return workspace.categories.reduce((count: number, cat: any) => count + (cat.entities?.length || 0), 0);
  }

  async getCaptureCountByUser(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(captures)
      .where(eq(captures.userId, userId));
    return result[0]?.count || 0;
  }

  async updateWeeklyDigest(userId: string, enabled: boolean): Promise<void> {
    await db
      .update(userProfiles)
      .set({ weeklyDigestEnabled: enabled ? 1 : 0 })
      .where(eq(userProfiles.userId, userId));
  }

  async getUsersWithWeeklyDigest(): Promise<UserProfile[]> {
    return db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.weeklyDigestEnabled, 1));
  }

  async getWorkspaceCapabilities(tenantId: string): Promise<WorkspaceCapability[]> {
    return db
      .select()
      .from(workspaceCapabilities)
      .where(eq(workspaceCapabilities.tenantId, tenantId))
      .orderBy(asc(workspaceCapabilities.displayOrder));
  }

  async createWorkspaceCapability(data: InsertWorkspaceCapability): Promise<WorkspaceCapability> {
    const [created] = await db
      .insert(workspaceCapabilities)
      .values(data)
      .returning();
    return created;
  }

  async updateWorkspaceCapability(id: string, tenantId: string, data: Partial<InsertWorkspaceCapability>): Promise<WorkspaceCapability | undefined> {
    const [updated] = await db
      .update(workspaceCapabilities)
      .set(data)
      .where(and(eq(workspaceCapabilities.id, id), eq(workspaceCapabilities.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteWorkspaceCapability(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(workspaceCapabilities)
      .where(and(eq(workspaceCapabilities.id, id), eq(workspaceCapabilities.tenantId, tenantId)))
      .returning();
    return result.length > 0;
  }

  async reorderWorkspaceCapabilities(tenantId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(workspaceCapabilities)
        .set({ displayOrder: i })
        .where(and(eq(workspaceCapabilities.id, orderedIds[i]), eq(workspaceCapabilities.tenantId, tenantId)));
    }
  }

  async getCompetitorCapabilities(tenantId: string, entityId: string): Promise<CompetitorCapability[]> {
    return db
      .select()
      .from(competitorCapabilities)
      .where(and(eq(competitorCapabilities.tenantId, tenantId), eq(competitorCapabilities.entityId, entityId)));
  }

  async getAllCompetitorCapabilities(tenantId: string): Promise<CompetitorCapability[]> {
    return db
      .select()
      .from(competitorCapabilities)
      .where(eq(competitorCapabilities.tenantId, tenantId));
  }

  async upsertCompetitorCapability(tenantId: string, entityId: string, capabilityId: string, status: string, evidence?: string | null): Promise<CompetitorCapability> {
    const existing = await db
      .select()
      .from(competitorCapabilities)
      .where(and(
        eq(competitorCapabilities.tenantId, tenantId),
        eq(competitorCapabilities.entityId, entityId),
        eq(competitorCapabilities.capabilityId, capabilityId)
      ));

    if (existing.length > 0) {
      const [updated] = await db
        .update(competitorCapabilities)
        .set({ status, evidence: evidence ?? existing[0].evidence, updatedAt: new Date() })
        .where(and(
          eq(competitorCapabilities.tenantId, tenantId),
          eq(competitorCapabilities.entityId, entityId),
          eq(competitorCapabilities.capabilityId, capabilityId)
        ))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(competitorCapabilities)
        .values({ tenantId, entityId, capabilityId, status, evidence })
        .returning();
      return created;
    }
  }
  async getCompetitorPricing(tenantId: string, entityId: string): Promise<CompetitorPricing[]> {
    return db
      .select()
      .from(competitorPricing)
      .where(and(eq(competitorPricing.tenantId, tenantId), eq(competitorPricing.entityId, entityId)))
      .orderBy(desc(competitorPricing.capturedDate));
  }

  async createCompetitorPricing(data: InsertCompetitorPricing): Promise<CompetitorPricing> {
    const [created] = await db
      .insert(competitorPricing)
      .values(data)
      .returning();
    return created;
  }

  async deleteCompetitorPricing(id: string, tenantId: string, entityId: string): Promise<boolean> {
    const result = await db
      .delete(competitorPricing)
      .where(and(
        eq(competitorPricing.id, id),
        eq(competitorPricing.tenantId, tenantId),
        eq(competitorPricing.entityId, entityId)
      ))
      .returning();
    return result.length > 0;
  }

  async getStrategicDirection(tenantId: string, entityId: string): Promise<StrategicDirection | undefined> {
    const [result] = await db
      .select()
      .from(strategicDirections)
      .where(and(eq(strategicDirections.tenantId, tenantId), eq(strategicDirections.entityId, entityId)));
    return result;
  }

  async upsertStrategicDirection(tenantId: string, entityId: string, data: { whereHeading?: string | null; whatMeansForYou?: string | null }): Promise<StrategicDirection> {
    const existing = await this.getStrategicDirection(tenantId, entityId);
    if (existing) {
      const [updated] = await db
        .update(strategicDirections)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(strategicDirections.tenantId, tenantId), eq(strategicDirections.entityId, entityId)))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(strategicDirections)
        .values({ tenantId, entityId, ...data })
        .returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
