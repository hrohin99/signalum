import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { userProfiles, workspaces, captures, briefs, type InsertUserProfile, type UserProfile, type InsertWorkspace, type Workspace, type InsertCapture, type Capture, type InsertBrief, type Brief } from "@shared/schema";

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
}

export const storage = new DatabaseStorage();
