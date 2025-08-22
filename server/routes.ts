import type { Express } from "express";
import { createServer, type Server } from "http";
import { getDb, dbConnection } from "./db";
import { scheduler } from "./scheduler";
import { 
  authenticateToken, 
  requireRole, 
  requireAdmin, 
  generateToken, 
  comparePassword,
  hashPassword,
  type AuthRequest 
} from "./auth";
import { z } from "zod";
import { 
  users, 
  sites, 
  dailyClosingReadings, 
  userSiteAssignments, 
  adminPreferences,
  sensorReadings,
  loginSchema,
  insertUserSchema,
  insertSiteSchema,
  updateViewModeSchema,
  type User,
  type DashboardData,
  type SiteWithReadings,
  type AuthResponse
} from "@shared/schema";
import { eq, desc, and, inArray, sql, gte } from "drizzle-orm";
import { ne } from "drizzle-orm";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize database connection and scheduler
  try {
    await dbConnection.connect();
    scheduler.start();
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }

  // Health check endpoint for Docker
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Token validation endpoint for session persistence
  app.get("/api/auth/validate", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      console.log(`✅ Token validation successful for user: ${user.username}`);
      
      res.json({ 
        valid: true, 
        user: user,
        timestamp: new Date().toISOString(),
        tokenInfo: {
          userId: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      console.error("❌ Token validation error:", error);
      res.status(401).json({ 
        valid: false, 
        message: "Invalid token",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Enhanced login with better error handling
  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log("🔐 Login attempt received");
      const { username, password } = loginSchema.parse(req.body);
      
      // Ensure database is connected with retry logic
      let db;
      let retries = 3;
      while (retries > 0) {
        try {
          db = getDb();
          break;
        } catch (error) {
          console.error(`Database connection attempt failed, ${retries} retries left:`, error);
          retries--;
          if (retries === 0) {
            console.error("❌ Database connection failed completely");
            return res.status(500).json({ message: "Database connection failed" });
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`🔍 Looking up user: ${username}`);
      const user = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user.length) {
        console.log(`❌ User not found: ${username}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user[0].isActive) {
        console.log(`❌ User inactive: ${username}`);
        return res.status(401).json({ message: "Account is inactive" });
      }

      const isValidPassword = await comparePassword(password, user[0].password);
      if (!isValidPassword) {
        console.log(`❌ Invalid password for user: ${username}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Update last login
      await db
        .update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user[0].id));

      const { password: _, ...userWithoutPassword } = user[0];
      const token = generateToken(userWithoutPassword);

      console.log(`✅ Login successful for user: ${username}, role: ${user[0].role}`);

      const response: AuthResponse = {
        user: userWithoutPassword,
        token
      };

      res.json(response);
    } catch (error) {
      console.error("❌ Login error:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid request format" });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", authenticateToken, (req, res) => {
    res.json({ message: "Logged out successfully" });
  });

  // ===== USER MANAGEMENT ENDPOINTS (ADMIN ONLY) =====

  // Get all users
  app.get("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          fullName: users.fullName,
          isActive: users.isActive,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.createdAt);

      console.log(`📋 Retrieved ${allUsers.length} users`);
      res.json(allUsers);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new user
  app.post("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    try {
      // Create a validation schema that makes password required for new users
      const createUserSchema = insertUserSchema.extend({
        password: z.string().min(6, "Password must be at least 6 characters")
      });
      
      const userData = createUserSchema.parse(req.body);
      const db = getDb();

      // Check if username already exists
      const existingUsername = await db
        .select()
        .from(users)
        .where(eq(users.username, userData.username))
        .limit(1);

      if (existingUsername.length > 0) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check if email already exists
      const existingEmail = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existingEmail.length > 0) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await hashPassword(userData.password);
      
      const newUser = await db
        .insert(users)
        .values({
          ...userData,
          password: hashedPassword,
        })
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          fullName: users.fullName,
          isActive: users.isActive,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        });

      console.log(`✅ User created: ${newUser[0].username} (${newUser[0].role})`);
      res.status(201).json(newUser[0]);
    } catch (error) {
      console.error("Create user error:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid data provided",
          details: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Update user
  app.put("/api/users/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Create a validation schema for updates (password optional)
      const updateUserSchema = insertUserSchema.extend({
        password: z.string().min(6, "Password must be at least 6 characters").optional()
      }).omit({ username: true }); // Username can't be changed
      
      const userData = updateUserSchema.parse(req.body);
      const db = getDb();

      // Check if user exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (existingUser.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if email already exists (excluding current user)
      if (userData.email) {
        const existingEmail = await db
          .select()
          .from(users)
          .where(and(eq(users.email, userData.email), ne(users.id, userId)))
          .limit(1);

        if (existingEmail.length > 0) {
          return res.status(400).json({ message: "Email already exists" });
        }
      }

      // Prepare update data
      const updateData: any = {
        email: userData.email,
        role: userData.role,
        fullName: userData.fullName,
        isActive: userData.isActive,
      };

      // Hash password if provided
      if (userData.password && userData.password.trim() !== '') {
        updateData.password = await hashPassword(userData.password);
      }

      const updatedUser = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          fullName: users.fullName,
          isActive: users.isActive,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        });

      console.log(`✅ User updated: ${updatedUser[0].username}`);
      res.json(updatedUser[0]);
    } catch (error) {
      console.error("Update user error:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid data provided",
          details: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Delete user
  app.delete("/api/users/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const db = getDb();
      const currentUser = req.user!;

      // Prevent self-deletion
      if (userId === currentUser.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      // Check if user exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (existingUser.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      // Delete related records first (cascade delete)
      await db
        .delete(userSiteAssignments)
        .where(eq(userSiteAssignments.userId, userId));

      await db
        .delete(adminPreferences)
        .where(eq(adminPreferences.userId, userId));

      // Delete the user
      await db
        .delete(users)
        .where(eq(users.id, userId));

      console.log(`🗑️ User deleted: ${existingUser[0].username}`);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Get user by ID (admin only)
  app.get("/api/users/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const db = getDb();
      const user = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          fullName: users.fullName,
          isActive: users.isActive,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user[0]);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== SITE MANAGEMENT AND USER-SITE ASSIGNMENTS =====

  // Get all sites
  app.get("/api/sites", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const db = getDb();
      const user = req.user!;

      let sitesQuery;
      
      if (user.role === 'admin') {
        // Admin can see all sites
        sitesQuery = db.select().from(sites).where(eq(sites.isActive, true));
      } else {
        // Manager/Supervisor can only see assigned sites
        const assignedSiteIds = await db
          .select({ siteId: userSiteAssignments.siteId })
          .from(userSiteAssignments)
          .where(eq(userSiteAssignments.userId, user.id));

        if (assignedSiteIds.length === 0) {
          return res.json([]);
        }

        sitesQuery = db
          .select()
          .from(sites)
          .where(
            and(
              eq(sites.isActive, true),
              inArray(sites.id, assignedSiteIds.map(a => a.siteId))
            )
          );
      }

      const allSites = await sitesQuery;
      res.json(allSites);
    } catch (error) {
      console.error("Get sites error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Assign user to sites
  app.post("/api/users/:userId/sites", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { siteIds } = req.body; // Array of site IDs
      
      if (isNaN(userId) || !Array.isArray(siteIds)) {
        return res.status(400).json({ message: "Invalid user ID or site IDs" });
      }

      const db = getDb();

      // First, remove existing assignments
      await db
        .delete(userSiteAssignments)
        .where(eq(userSiteAssignments.userId, userId));

      // Add new assignments
      if (siteIds.length > 0) {
        const assignments = siteIds.map(siteId => ({
          userId,
          siteId: parseInt(siteId)
        }));

        await db.insert(userSiteAssignments).values(assignments);
      }

      console.log(`✅ Updated site assignments for user ${userId}: ${siteIds.length} sites`);
      res.json({ message: "Site assignments updated successfully" });
    } catch (error) {
      console.error("Update site assignments error:", error);
      res.status(500).json({ message: "Failed to update site assignments" });
    }
  });

  // Get user's site assignments
  app.get("/api/users/:userId/sites", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const db = getDb();
      const assignments = await db
        .select({
          siteId: userSiteAssignments.siteId,
          siteName: sites.name,
          siteLocation: sites.location,
        })
        .from(userSiteAssignments)
        .innerJoin(sites, eq(sites.id, userSiteAssignments.siteId))
        .where(eq(userSiteAssignments.userId, userId));

      res.json(assignments);
    } catch (error) {
      console.error("Get user site assignments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== DASHBOARD AND DATA ENDPOINTS =====

  // Dashboard data endpoint (updated to work with proper site data)
  app.get("/api/dashboard", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const db = getDb();
      const user = req.user!;
      const now = new Date();

      console.log(`📊 Dashboard request from ${user.username} (${user.role})`);

      // Get user's view mode (admin only)
      let viewMode = 'closing';
      if (user.role === 'admin') {
        const prefs = await db
          .select()
          .from(adminPreferences)
          .where(eq(adminPreferences.userId, user.id))
          .limit(1);
        
        viewMode = prefs.length > 0 ? prefs[0].viewMode : 'closing';
      }

      // Get sites based on user role - EXCLUDE test sites
      let userSites = [];
      
      if (user.role === 'admin') {
        // Admin sees all active sites EXCEPT test sites
        userSites = await db
          .select()
          .from(sites)
          .where(
            and(
              eq(sites.isActive, true),
              sql`${sites.deviceId} NOT IN ('test-site-a', 'main-site-a', 'harare-branch')`,
              sql`${sites.deviceId} LIKE 'simbisa-%'`  // Only simbisa sites
            )
          )
          .orderBy(sites.name);
      } else {
        // Non-admin users see only assigned sites
        const assignedSiteIds = await db
          .select({ siteId: userSiteAssignments.siteId })
          .from(userSiteAssignments)
          .where(eq(userSiteAssignments.userId, user.id));

        if (assignedSiteIds.length === 0) {
          return res.json({
            sites: [],
            systemStatus: { sitesOnline: 0, totalSites: 0, lowFuelAlerts: 0, generatorsRunning: 0 },
            recentActivity: [],
            viewMode
          });
        }

        userSites = await db
          .select()
          .from(sites)
          .where(
            and(
              eq(sites.isActive, true),
              inArray(sites.id, assignedSiteIds.map(a => a.siteId)),
              sql`${sites.deviceId} NOT IN ('test-site-a', 'main-site-a', 'harare-branch')`,
              sql`${sites.deviceId} LIKE 'simbisa-%'`
            )
          )
          .orderBy(sites.name);
      }

      console.log(`📍 Found ${userSites.length} simbisa sites for user ${user.username}`);

      if (userSites.length === 0) {
        return res.json({
          sites: [],
          systemStatus: { sitesOnline: 0, totalSites: 0, lowFuelAlerts: 0, generatorsRunning: 0 },
          recentActivity: [],
          viewMode
        });
      }

      // Extended time range - check last 30 days for real data
      const LOOKBACK_DAYS = 30;
      const lookbackTime = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

      // Get readings for each site - PRIORITIZE SITES WITH ACTUAL DATA
      const sitesWithReadings: SiteWithReadings[] = [];

      for (const site of userSites) {
        console.log(`🔍 Processing site: ${site.name} (device: ${site.deviceId})`);
        
        let latestReading: any = null;

        if (viewMode === 'realtime' && user.role === 'admin') {
          // Get REAL-TIME data - GET THE ABSOLUTE LATEST READINGS
          try {
            const realtimeReadings = await db
              .select()
              .from(sensorReadings)
              .where(eq(sensorReadings.deviceId, site.deviceId))
              .orderBy(desc(sensorReadings.time))
              .limit(100); // Get more readings to ensure we have all sensor types

            if (realtimeReadings.length > 0) {
              console.log(`📈 Found ${realtimeReadings.length} total readings for ${site.deviceId}`);
              
              // Get latest reading timestamp
              const latestTimestamp = realtimeReadings[0].time;
              console.log(`⏰ Latest reading timestamp: ${latestTimestamp}`);

              // Group by sensor name to get latest of each type
              const sensorMap = new Map();
              realtimeReadings.forEach(reading => {
                const sensorKey = reading.sensorName.toLowerCase().trim();
                if (!sensorMap.has(sensorKey)) {
                  sensorMap.set(sensorKey, reading);
                }
              });

              // Extract sensor values
              const fuelLevelReading = sensorMap.get('fuel_sensor_level');
              const fuelVolumeReading = sensorMap.get('fuel_sensor_volume');
              const tempReading = sensorMap.get('fuel_sensor_temp') || sensorMap.get('fuel_sensor_temperature');
              const generatorReading = sensorMap.get('generator_state') || sensorMap.get(' generator _state');
              const zesaReading = sensorMap.get('zesa_state');

              // Only create reading if we have meaningful data
              if (fuelLevelReading || fuelVolumeReading) {
                latestReading = {
                  id: 0,
                  siteId: site.id,
                  deviceId: site.deviceId,
                  fuelLevel: fuelLevelReading ? fuelLevelReading.value.toString() : '0',
                  fuelVolume: fuelVolumeReading ? fuelVolumeReading.value.toString() : '0',
                  temperature: tempReading ? tempReading.value.toString() : '0',
                  generatorState: generatorReading ? generatorReading.value.toString() : 'unknown',
                  zesaState: zesaReading ? zesaReading.value.toString() : 'unknown',
                  capturedAt: latestTimestamp,
                  createdAt: new Date(),
                };

                console.log(`✅ Real-time data for ${site.name}:`, {
                  fuel: `${fuelLevelReading?.value || 0}%`,
                  volume: `${fuelVolumeReading?.value || 0}L`,
                  temp: `${tempReading?.value || 0}°C`,
                  timestamp: latestTimestamp
                });
              }
            } else {
              console.log(`⚠️ No readings found for ${site.deviceId}`);
            }
          } catch (error) {
            console.error(`❌ Error getting real-time data for ${site.deviceId}:`, error);
          }
        } else {
          // Get daily closing readings
          try {
            const closingReading = await db
              .select()
              .from(dailyClosingReadings)
              .where(eq(dailyClosingReadings.siteId, site.id))
              .orderBy(desc(dailyClosingReadings.capturedAt))
              .limit(1);

            if (closingReading.length > 0) {
              latestReading = closingReading[0];
            }
          } catch (error) {
            console.error(`❌ Error getting daily readings for ${site.name}:`, error);
          }
        }

        // Only include sites that have actual readings OR are important
        const fuelLevelPercentage = latestReading ? parseFloat(latestReading.fuelLevel || '0') : 0;
        const hasValidData = latestReading && (
          fuelLevelPercentage > 0 || 
          parseFloat(latestReading.fuelVolume || '0') > 0 ||
          latestReading.temperature !== '0'
        );

        // Skip sites with no data unless they're recently active
        if (!hasValidData && !latestReading) {
          console.log(`⏭️ Skipping ${site.name} - no meaningful data`);
          continue;
        }

        const generatorOnline = latestReading?.generatorState === 'on' || 
                              latestReading?.generatorState === '1' || 
                              latestReading?.generatorState === 'true' ||
                              latestReading?.generatorState === 1;
                              
        const zesaOnline = latestReading?.zesaState === 'on' || 
                        latestReading?.zesaState === '1' || 
                        latestReading?.zesaState === 'true' ||
                        latestReading?.zesaState === 1;

        let alertStatus: 'normal' | 'low_fuel' | 'generator_off' = 'normal';
        if (fuelLevelPercentage < parseFloat(site.lowFuelThreshold)) {
          alertStatus = 'low_fuel';
        } else if (!generatorOnline && fuelLevelPercentage > 0) {
          alertStatus = 'generator_off';
        }

        sitesWithReadings.push({
          ...site,
          latestReading: latestReading || undefined,
          generatorOnline,
          zesaOnline,
          fuelLevelPercentage,
          alertStatus,
        });
      }

      // Sort by sites with recent data first, then by fuel level
      sitesWithReadings.sort((a, b) => {
        // Sites with recent data first
        const aHasData = a.latestReading ? 1 : 0;
        const bHasData = b.latestReading ? 1 : 0;
        if (bHasData !== aHasData) return bHasData - aHasData;
        
        // Then by fuel level (highest first for sites with data)
        return b.fuelLevelPercentage - a.fuelLevelPercentage;
      });

      // Calculate system status
      const sitesWithRecentData = sitesWithReadings.filter(s => s.latestReading);
      const systemStatus = {
        sitesOnline: sitesWithRecentData.length,
        totalSites: sitesWithReadings.length,
        lowFuelAlerts: sitesWithReadings.filter(s => s.alertStatus === 'low_fuel').length,
        generatorsRunning: sitesWithReadings.filter(s => s.generatorOnline).length,
      };

      // Generate recent activity - only from sites with actual data
      const recentActivity = sitesWithRecentData
        .filter(site => site.latestReading)
        .slice(0, 10)
        .map((site, index) => ({
          id: index + 1,
          siteId: site.id,
          siteName: site.name,
          event: site.alertStatus === 'low_fuel' ? 'Low Fuel Alert' : 
                site.alertStatus === 'generator_off' ? 'Generator Offline' : 'Sensor Update',
          value: `${site.fuelLevelPercentage.toFixed(1)}% (${site.latestReading?.fuelVolume || '0'}L)`,
          timestamp: site.latestReading?.capturedAt || new Date(),
          status: site.alertStatus === 'low_fuel' ? 'Low Fuel' : 
                  site.alertStatus === 'generator_off' ? 'Offline' : 'Normal',
        }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const dashboardData: DashboardData & { viewMode: string } = {
        sites: sitesWithReadings,
        systemStatus,
        recentActivity,
        viewMode,
      };

      console.log(`✅ Dashboard ready for ${user.username}:`, {
        totalSites: sitesWithReadings.length,
        sitesWithData: sitesWithRecentData.length,
        lowFuelAlerts: systemStatus.lowFuelAlerts,
        generatorsRunning: systemStatus.generatorsRunning,
        viewMode
      });

      res.json(dashboardData);

    } catch (error) {
      console.error("❌ Dashboard error:", error);
      res.status(500).json({ 
        message: "Dashboard error: " + error.message,
        sites: [],
        systemStatus: { sitesOnline: 0, totalSites: 0, lowFuelAlerts: 0, generatorsRunning: 0 },
        recentActivity: [],
        viewMode: 'closing'
      });
    }
  });


  // Admin view mode toggle
  app.put("/api/admin/view-mode", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { viewMode } = updateViewModeSchema.parse(req.body);
      const db = getDb();
      const user = req.user!;

      // Update or insert admin preference
      const existing = await db
        .select()
        .from(adminPreferences)
        .where(eq(adminPreferences.userId, user.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(adminPreferences)
          .set({ viewMode, updatedAt: new Date() })
          .where(eq(adminPreferences.userId, user.id));
      } else {
        await db
          .insert(adminPreferences)
          .values({ userId: user.id, viewMode });
      }

      res.json({ viewMode });
    } catch (error) {
      console.error("Update view mode error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get("/api/admin/view-mode", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const db = getDb();
      const user = req.user!;

      const prefs = await db
        .select()
        .from(adminPreferences)
        .where(eq(adminPreferences.userId, user.id))
        .limit(1);

      const viewMode = prefs.length > 0 ? prefs[0].viewMode : 'closing';
      res.json({ viewMode });
    } catch (error) {
      console.error("Get view mode error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Manual trigger for daily capture (admin only, for testing)
  app.post("/api/admin/trigger-capture", authenticateToken, requireAdmin, async (req, res) => {
    try {
      await scheduler.triggerManualCapture();
      res.json({ message: "Daily capture triggered successfully" });
    } catch (error) {
      console.error("Trigger capture error:", error);
      res.status(500).json({ message: "Failed to trigger capture" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}