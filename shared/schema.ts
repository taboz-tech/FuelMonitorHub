import { pgTable, text, serial, integer, boolean, timestamp, decimal, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'admin', 'manager', 'supervisor'
  fullName: text("full_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sites table
export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  deviceId: text("device_id").notNull().unique(),
  fuelCapacity: decimal("fuel_capacity", { precision: 10, scale: 2 }).notNull(), // in liters
  lowFuelThreshold: decimal("low_fuel_threshold", { precision: 5, scale: 2 }).notNull().default("25"), // percentage
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User site assignments
export const userSiteAssignments = pgTable("user_site_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  siteId: integer("site_id").notNull().references(() => sites.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Daily closing readings
export const dailyClosingReadings = pgTable("daily_closing_readings", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => sites.id),
  deviceId: text("device_id").notNull(),
  fuelLevel: decimal("fuel_level", { precision: 5, scale: 2 }), // percentage
  fuelVolume: decimal("fuel_volume", { precision: 10, scale: 2 }), // liters
  temperature: decimal("temperature", { precision: 5, scale: 2 }), // celsius
  generatorState: text("generator_state"), // 'on', 'off'
  zesaState: text("zesa_state"), // 'on', 'off'
  capturedAt: timestamp("captured_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Admin preferences
export const adminPreferences = pgTable("admin_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  viewMode: text("view_mode").notNull().default("closing"), // 'closing', 'realtime'
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Cumulative daily readings table
export const cumulativeReadings = pgTable("cumulative_readings", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => sites.id),
  deviceId: text("device_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  
  // Fuel metrics
  totalFuelConsumed: decimal("total_fuel_consumed", { precision: 10, scale: 2 }).default("0"), // in liters
  totalFuelToppedup: decimal("total_fuel_topped_up", { precision: 10, scale: 2 }).default("0"), // in liters
  fuelConsumedPercent: decimal("fuel_consumed_percent", { precision: 5, scale: 2 }).default("0"), // percentage
  fuelToppedupPercent: decimal("fuel_topped_up_percent", { precision: 5, scale: 2 }).default("0"), // percentage
  
  // Runtime metrics
  totalGeneratorRuntime: decimal("total_generator_runtime", { precision: 10, scale: 2 }).default("0"), // in hours
  totalZesaRuntime: decimal("total_zesa_runtime", { precision: 10, scale: 2 }).default("0"), // in hours
  totalOfflineTime: decimal("total_offline_time", { precision: 10, scale: 2 }).default("0"), // in hours
  
  // Metadata
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sensor readings (reference to existing external table structure)
export const sensorReadings = pgTable("sensor_readings", {
  time: timestamp("time").notNull(),
  deviceId: text("device_id").notNull(),
  sensorName: text("sensor_name").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLogin: true,
});

export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
});

export const insertUserSiteAssignmentSchema = createInsertSchema(userSiteAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertDailyClosingReadingSchema = createInsertSchema(dailyClosingReadings).omit({
  id: true,
  createdAt: true,
});

export const insertAdminPreferenceSchema = createInsertSchema(adminPreferences).omit({
  id: true,
  updatedAt: true,
});

// Auth schemas
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateViewModeSchema = z.object({
  viewMode: z.enum(["closing", "realtime"]),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type UserSiteAssignment = typeof userSiteAssignments.$inferSelect;
export type InsertUserSiteAssignment = z.infer<typeof insertUserSiteAssignmentSchema>;
export type DailyClosingReading = typeof dailyClosingReadings.$inferSelect;
export type InsertDailyClosingReading = z.infer<typeof insertDailyClosingReadingSchema>;
export type AdminPreference = typeof adminPreferences.$inferSelect;
export type InsertAdminPreference = z.infer<typeof insertAdminPreferenceSchema>;
export type SensorReading = typeof sensorReadings.$inferSelect;
export type LoginRequest = z.infer<typeof loginSchema>;
export type UpdateViewModeRequest = z.infer<typeof updateViewModeSchema>;

// Response types
export type AuthResponse = {
  user: Omit<User, 'password'>;
  token: string;
};

export type SiteWithReadings = Site & {
  latestReading?: DailyClosingReading;
  generatorOnline: boolean;
  zesaOnline: boolean;
  fuelLevelPercentage: number;
  alertStatus: 'normal' | 'low_fuel' | 'generator_off';
};

export type DashboardData = {
  sites: SiteWithReadings[];
  systemStatus: {
    sitesOnline: number;
    totalSites: number;
    lowFuelAlerts: number;
    generatorsRunning: number;
    zesaRunning: number;        // NEW: ZESA running count
    offlineSites: number;       // NEW: Offline sites count
  };
  recentActivity: Array<{
    id: number;
    siteId: number;
    siteName: string;
    event: string;
    value: string;
    timestamp: Date;
    status: string;
  }>;
};

// Enhanced user schemas for better validation
export const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  role: z.enum(["admin", "supervisor", "manager"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  role: z.enum(["admin", "supervisor", "manager"]),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  isActive: z.boolean(),
});

// Export types for the forms
export type CreateUserRequest = z.infer<typeof createUserSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;

export type CumulativeReading = typeof cumulativeReadings.$inferSelect;
export type InsertCumulativeReading = typeof cumulativeReadings.$inferInsert;