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

      // Get sites based on user role - ONLY SIMBISA SITES
      let userSites = [];
      
      if (user.role === 'admin') {
        // Admin sees all active simbisa sites
        userSites = await db
          .select()
          .from(sites)
          .where(
            and(
              eq(sites.isActive, true),
              sql`${sites.deviceId} LIKE 'simbisa-%'`
            )
          )
          .orderBy(sites.name);
      } else {
        // Non-admin users see only assigned simbisa sites
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

      // Get readings for each site
      const sitesWithReadings: SiteWithReadings[] = [];

      for (const site of userSites) {
        console.log(`🔍 Processing site: ${site.name} (device: ${site.deviceId})`);
        
        let latestReading: any = null;

        if (viewMode === 'realtime' && user.role === 'admin') {
          // Get REAL-TIME data from sensor_readings
          try {
            // FIXED: Get the most recent readings for each sensor type
            const realtimeQuery = `
              SELECT DISTINCT ON (sensor_name) 
                time, device_id, sensor_name, value, unit
              FROM sensor_readings 
              WHERE device_id = $1
              ORDER BY sensor_name, time DESC
            `;
            
            const realtimeResult = await db.execute(sql`${sql.raw(realtimeQuery)}`, [site.deviceId]);
            const realtimeReadings = realtimeResult.rows;

            if (realtimeReadings.length > 0) {
              console.log(`📈 Found ${realtimeReadings.length} sensor types for ${site.deviceId}`);
              
              // Map sensor readings by type
              const sensorMap = new Map();
              realtimeReadings.forEach((row: any) => {
                const sensorKey = row.sensor_name.toLowerCase().trim();
                sensorMap.set(sensorKey, row);
              });

              // Get the latest timestamp
              const timestamps = realtimeReadings.map((r: any) => new Date(r.time));
              const latestTimestamp = new Date(Math.max(...timestamps.map(t => t.getTime())));

              // Extract sensor values properly
              const fuelLevelRow = sensorMap.get('fuel_sensor_level');
              const fuelVolumeRow = sensorMap.get('fuel_sensor_volume');
              const tempRow = sensorMap.get('fuel_sensor_temp') || sensorMap.get('fuel_sensor_temperature');
              const generatorRow = sensorMap.get('generator_state');
              const zesaRow = sensorMap.get('zesa_state');

              console.log(`📊 Sensor data for ${site.name}:`, {
                fuelLevel: fuelLevelRow ? `${fuelLevelRow.value}%` : 'N/A',
                fuelVolume: fuelVolumeRow ? `${fuelVolumeRow.value}L` : 'N/A',
                temperature: tempRow ? `${tempRow.value}°C` : 'N/A',
                generator: generatorRow?.value || 'unknown',
                zesa: zesaRow?.value || 'unknown',
                timestamp: latestTimestamp
              });

              // Create the reading object with CORRECT values
              latestReading = {
                id: 0,
                siteId: site.id,
                deviceId: site.deviceId,
                fuelLevel: fuelLevelRow ? parseFloat(fuelLevelRow.value).toFixed(2) : null,
                fuelVolume: fuelVolumeRow ? parseFloat(fuelVolumeRow.value).toFixed(2) : null,
                temperature: tempRow ? parseFloat(tempRow.value).toFixed(2) : null,
                generatorState: generatorRow ? generatorRow.value.toString() : 'unknown',
                zesaState: zesaRow ? zesaRow.value.toString() : 'unknown',
                capturedAt: latestTimestamp,
                createdAt: new Date(),
              };
            } else {
              console.log(`⚠️ No real-time readings found for ${site.deviceId}`);
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

        // FIXED: Calculate fuel level percentage correctly
        const fuelLevelPercentage = latestReading?.fuelLevel 
          ? Math.max(0, Math.min(100, parseFloat(latestReading.fuelLevel)))
          : 0;

        // FIXED: Generator and ZESA state checking
        const generatorOnline = ['1', 'on', 'true', '1.0', 1, true].includes(latestReading?.generatorState);
        const zesaOnline = ['1', 'on', 'true', '1.0', 1, true].includes(latestReading?.zesaState);

        // FIXED: Alert status calculation
        let alertStatus: 'normal' | 'low_fuel' | 'generator_off' = 'normal';
        if (fuelLevelPercentage < parseFloat(site.lowFuelThreshold)) {
          alertStatus = 'low_fuel';
        } else if (!generatorOnline && fuelLevelPercentage > 0) {
          alertStatus = 'generator_off';
        }

        // Only include sites that have actual meaningful data
        const hasValidData = latestReading && (
          fuelLevelPercentage > 0 || 
          (latestReading.fuelVolume && parseFloat(latestReading.fuelVolume) > 0)
        );

        if (hasValidData) {
          sitesWithReadings.push({
            ...site,
            latestReading,
            generatorOnline,
            zesaOnline,
            fuelLevelPercentage,
            alertStatus,
          });
        } else {
          console.log(`⏭️ Skipping ${site.name} - no meaningful sensor data`);
        }
      }

      // Sort by fuel level descending (highest fuel first)
      sitesWithReadings.sort((a, b) => b.fuelLevelPercentage - a.fuelLevelPercentage);

      // Calculate system status
      const systemStatus = {
        sitesOnline: sitesWithReadings.length,
        totalSites: userSites.length,
        lowFuelAlerts: sitesWithReadings.filter(s => s.alertStatus === 'low_fuel').length,
        generatorsRunning: sitesWithReadings.filter(s => s.generatorOnline).length,
      };

      // Generate recent activity - with better timestamps
      const recentActivity = sitesWithReadings
        .filter(site => site.latestReading)
        .slice(0, 10)
        .map((site, index) => {
          const timestamp = new Date(site.latestReading!.capturedAt);
          return {
            id: index + 1,
            siteId: site.id,
            siteName: site.name,
            event: site.alertStatus === 'low_fuel' ? 'Low Fuel Alert' : 
                    site.alertStatus === 'generator_off' ? 'Generator Offline' : 'Normal Reading',
            value: `${site.fuelLevelPercentage.toFixed(1)}% (${site.latestReading?.fuelVolume || '0'}L)`,
            timestamp: timestamp,
            status: site.alertStatus === 'low_fuel' ? 'Low Fuel' : 
                    site.alertStatus === 'generator_off' ? 'Offline' : 'Normal',
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const dashboardData: DashboardData & { viewMode: string } = {
        sites: sitesWithReadings,
        systemStatus,
        recentActivity,
        viewMode,
      };

      console.log(`✅ Dashboard ready for ${user.username}:`, {
        totalSitesInDB: userSites.length,
        sitesWithValidData: sitesWithReadings.length,
        lowFuelAlerts: systemStatus.lowFuelAlerts,
        generatorsRunning: systemStatus.generatorsRunning,
        viewMode,
        sampleSite: sitesWithReadings[0] ? {
          name: sitesWithReadings[0].name,
          fuelLevel: sitesWithReadings[0].fuelLevelPercentage,
          timestamp: sitesWithReadings[0].latestReading?.capturedAt
        } : null
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