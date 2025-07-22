import { 
  users, 
  sites, 
  dailyClosingReadings, 
  userSiteAssignments, 
  adminPreferences,
  type User, 
  type InsertUser,
  type Site,
  type InsertSite,
  type DailyClosingReading,
  type InsertDailyClosingReading,
  type UserSiteAssignment,
  type InsertUserSiteAssignment,
  type AdminPreference,
  type InsertAdminPreference
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  
  // Site methods
  getSite(id: number): Promise<Site | undefined>;
  getSiteByDeviceId(deviceId: string): Promise<Site | undefined>;
  getAllSites(): Promise<Site[]>;
  createSite(site: InsertSite): Promise<Site>;
  updateSite(id: number, site: Partial<InsertSite>): Promise<Site | undefined>;
  deleteSite(id: number): Promise<boolean>;
  
  // Daily reading methods
  getDailyReading(id: number): Promise<DailyClosingReading | undefined>;
  getDailyReadingsBySite(siteId: number, limit?: number): Promise<DailyClosingReading[]>;
  createDailyReading(reading: InsertDailyClosingReading): Promise<DailyClosingReading>;
  
  // User site assignment methods
  getUserSiteAssignments(userId: number): Promise<UserSiteAssignment[]>;
  assignUserToSite(assignment: InsertUserSiteAssignment): Promise<UserSiteAssignment>;
  removeUserSiteAssignment(userId: number, siteId: number): Promise<boolean>;
  
  // Admin preference methods
  getAdminPreference(userId: number): Promise<AdminPreference | undefined>;
  setAdminPreference(preference: InsertAdminPreference): Promise<AdminPreference>;
  updateAdminPreference(userId: number, preference: Partial<InsertAdminPreference>): Promise<AdminPreference | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private sites: Map<number, Site>;
  private dailyReadings: Map<number, DailyClosingReading>;
  private userSiteAssignments: Map<string, UserSiteAssignment>;
  private adminPreferences: Map<number, AdminPreference>;
  private currentUserId: number;
  private currentSiteId: number;
  private currentReadingId: number;
  private currentAssignmentId: number;
  private currentPreferenceId: number;

  constructor() {
    this.users = new Map();
    this.sites = new Map();
    this.dailyReadings = new Map();
    this.userSiteAssignments = new Map();
    this.adminPreferences = new Map();
    this.currentUserId = 1;
    this.currentSiteId = 1;
    this.currentReadingId = 1;
    this.currentAssignmentId = 1;
    this.currentPreferenceId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      lastLogin: null,
      createdAt: new Date(),
      isActive: insertUser.isActive ?? true,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  // Site methods
  async getSite(id: number): Promise<Site | undefined> {
    return this.sites.get(id);
  }

  async getSiteByDeviceId(deviceId: string): Promise<Site | undefined> {
    return Array.from(this.sites.values()).find(site => site.deviceId === deviceId);
  }

  async getAllSites(): Promise<Site[]> {
    return Array.from(this.sites.values());
  }

  async createSite(insertSite: InsertSite): Promise<Site> {
    const id = this.currentSiteId++;
    const site: Site = {
      ...insertSite,
      id,
      createdAt: new Date(),
    };
    this.sites.set(id, site);
    return site;
  }

  async updateSite(id: number, siteData: Partial<InsertSite>): Promise<Site | undefined> {
    const site = this.sites.get(id);
    if (!site) return undefined;
    
    const updatedSite = { ...site, ...siteData };
    this.sites.set(id, updatedSite);
    return updatedSite;
  }

  async deleteSite(id: number): Promise<boolean> {
    return this.sites.delete(id);
  }

  // Daily reading methods
  async getDailyReading(id: number): Promise<DailyClosingReading | undefined> {
    return this.dailyReadings.get(id);
  }

  async getDailyReadingsBySite(siteId: number, limit: number = 30): Promise<DailyClosingReading[]> {
    return Array.from(this.dailyReadings.values())
      .filter(reading => reading.siteId === siteId)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
      .slice(0, limit);
  }

  async createDailyReading(insertReading: InsertDailyClosingReading): Promise<DailyClosingReading> {
    const id = this.currentReadingId++;
    const reading: DailyClosingReading = {
      ...insertReading,
      id,
      createdAt: new Date(),
    };
    this.dailyReadings.set(id, reading);
    return reading;
  }

  // User site assignment methods
  async getUserSiteAssignments(userId: number): Promise<UserSiteAssignment[]> {
    return Array.from(this.userSiteAssignments.values())
      .filter(assignment => assignment.userId === userId);
  }

  async assignUserToSite(insertAssignment: InsertUserSiteAssignment): Promise<UserSiteAssignment> {
    const id = this.currentAssignmentId++;
    const assignment: UserSiteAssignment = {
      ...insertAssignment,
      id,
      createdAt: new Date(),
    };
    const key = `${assignment.userId}-${assignment.siteId}`;
    this.userSiteAssignments.set(key, assignment);
    return assignment;
  }

  async removeUserSiteAssignment(userId: number, siteId: number): Promise<boolean> {
    const key = `${userId}-${siteId}`;
    return this.userSiteAssignments.delete(key);
  }

  // Admin preference methods
  async getAdminPreference(userId: number): Promise<AdminPreference | undefined> {
    return Array.from(this.adminPreferences.values())
      .find(pref => pref.userId === userId);
  }

  async setAdminPreference(insertPreference: InsertAdminPreference): Promise<AdminPreference> {
    const existing = await this.getAdminPreference(insertPreference.userId);
    if (existing) {
      return this.updateAdminPreference(insertPreference.userId, insertPreference) as Promise<AdminPreference>;
    }

    const id = this.currentPreferenceId++;
    const preference: AdminPreference = {
      ...insertPreference,
      id,
      updatedAt: new Date(),
    };
    this.adminPreferences.set(id, preference);
    return preference;
  }

  async updateAdminPreference(userId: number, preferenceData: Partial<InsertAdminPreference>): Promise<AdminPreference | undefined> {
    const existing = await this.getAdminPreference(userId);
    if (!existing) return undefined;

    const updatedPreference = {
      ...existing,
      ...preferenceData,
      updatedAt: new Date(),
    };
    this.adminPreferences.set(existing.id, updatedPreference);
    return updatedPreference;
  }
}

export const storage = new MemStorage();
