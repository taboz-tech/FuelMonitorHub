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

      console.log(`🎛️ View mode: ${viewMode}`);

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
            systemStatus: { 
              sitesOnline: 0, 
              totalSites: 0, 
              lowFuelAlerts: 0, 
              generatorsRunning: 0,
              zesaRunning: 0,
              offlineSites: 0
            },
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
          systemStatus: { 
            sitesOnline: 0, 
            totalSites: 0, 
            lowFuelAlerts: 0, 
            generatorsRunning: 0,
            zesaRunning: 0,
            offlineSites: 0
          },
          recentActivity: [],
          viewMode
        });
      }

      // Get readings for each site
      const sitesWithReadings: SiteWithReadings[] = [];
      const offlineSites: any[] = []; // Track sites with no recent data
      
      // Define what constitutes "recent" data (last 24 hours)
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      for (const site of userSites) {
        console.log(`🔍 Processing site: ${site.name} (device: ${site.deviceId})`);
        
        let latestReading: any = null;
        let hasRecentData = false;

        if (viewMode === 'realtime' && user.role === 'admin') {
          // Get REAL-TIME data using DISTINCT ON query (FIXED with fuel-specific timestamps)
          try {
            console.log(`📈 Getting real-time data for ${site.deviceId} using DISTINCT ON query`);
            
            const sensorResult = await db.execute(sql`
              SELECT DISTINCT ON (device_id, sensor_name) 
                time, device_id, sensor_name, value, unit 
              FROM sensor_readings 
              WHERE device_id = ${site.deviceId}
                AND sensor_name IN ('fuel_sensor_level', 'fuel_sensor_temp', 'fuel_sensor_volume', 'generator_state', 'zesa_state')
              ORDER BY device_id, sensor_name, time DESC
            `);
            
            console.log(`📊 Found ${sensorResult.rows.length} distinct sensor readings for ${site.deviceId}`);
            
            // Convert results to map for easy lookup
            const sensorMap = new Map();
            let fuelTimestamp = new Date(0); // Track fuel-specific timestamp only
            
            for (const row of sensorResult.rows) {
              const sensorRow = row as any;
              sensorMap.set(sensorRow.sensor_name, sensorRow);
              
              // Check if this site has recent data from any sensor
              const sensorTime = new Date(sensorRow.time);
              if (sensorTime > twentyFourHoursAgo) {
                hasRecentData = true;
              }
              
              // Only use fuel sensor timestamps for the main timestamp
              if (sensorRow.sensor_name.startsWith('fuel_sensor_')) {
                if (sensorTime > fuelTimestamp) {
                  fuelTimestamp = sensorTime;
                }
              }
              
              console.log(`📊 ${site.deviceId} ${sensorRow.sensor_name}: ${sensorRow.value}${sensorRow.unit || ''} at ${sensorRow.time}`);
            }

            if (sensorMap.size > 0) {
              // Extract sensor values
              const fuelLevelRow = sensorMap.get('fuel_sensor_level');
              const fuelVolumeRow = sensorMap.get('fuel_sensor_volume');
              const tempRow = sensorMap.get('fuel_sensor_temp');
              const generatorRow = sensorMap.get('generator_state');
              const zesaRow = sensorMap.get('zesa_state');

              // Use fuel sensor timestamp if available
              let displayTimestamp = fuelTimestamp;
              
              if (displayTimestamp.getTime() === 0 && fuelLevelRow) {
                displayTimestamp = new Date(fuelLevelRow.time);
              }
              
              if (displayTimestamp.getTime() === 0 && fuelVolumeRow) {
                displayTimestamp = new Date(fuelVolumeRow.time);
              }
              
              if (displayTimestamp.getTime() === 0) {
                displayTimestamp = new Date(Math.max(
                  ...Array.from(sensorMap.values()).map(s => new Date(s.time).getTime())
                ));
                console.log(`⚠️ No fuel sensor timestamps available for ${site.deviceId}, using fallback`);
              }

              console.log(`✅ Real-time data assembled for ${site.name}:`, {
                fuelLevel: fuelLevelRow ? `${fuelLevelRow.value}%` : 'N/A',
                fuelVolume: fuelVolumeRow ? `${fuelVolumeRow.value}L` : 'N/A',
                temperature: tempRow ? `${tempRow.value}°C` : 'N/A',
                generator: generatorRow ? generatorRow.value : 'N/A',
                zesa: zesaRow ? zesaRow.value : 'N/A',
                fuelTimestamp: displayTimestamp.toISOString(),
                hasRecentData: hasRecentData
              });

              // Create the reading object
              latestReading = {
                id: 0,
                siteId: site.id,
                deviceId: site.deviceId,
                fuelLevel: fuelLevelRow ? parseFloat(fuelLevelRow.value).toFixed(2) : null,
                fuelVolume: fuelVolumeRow ? parseFloat(fuelVolumeRow.value).toFixed(2) : null,
                temperature: tempRow ? parseFloat(tempRow.value).toFixed(2) : null,
                generatorState: generatorRow ? generatorRow.value.toString() : '-1',
                zesaState: zesaRow ? zesaRow.value.toString() : '-1',
                capturedAt: displayTimestamp,
                createdAt: displayTimestamp,
              };
            } else {
              console.log(`⚠️ No real-time readings found for ${site.deviceId}`);
              hasRecentData = false;
            }
          } catch (error) {
            console.error(`❌ Error getting real-time data for ${site.deviceId}:`, error);
            hasRecentData = false;
          }
        } else {
          // Get daily closing readings
          try {
            console.log(`📋 Getting daily closing readings for ${site.name}`);
            const closingReading = await db
              .select()
              .from(dailyClosingReadings)
              .where(eq(dailyClosingReadings.siteId, site.id))
              .orderBy(desc(dailyClosingReadings.capturedAt))
              .limit(1);

            if (closingReading.length > 0) {
              latestReading = closingReading[0];
              
              // Check if the daily reading is recent (within last 2 days for daily readings)
              const twoDaysAgo = new Date();
              twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
              hasRecentData = new Date(latestReading.capturedAt) > twoDaysAgo;
              
              console.log(`📋 Daily reading found for ${site.name}: ${latestReading.fuelLevel}% at ${latestReading.capturedAt}, recent: ${hasRecentData}`);
            } else {
              console.log(`⚠️ No daily readings found for ${site.name}`);
              hasRecentData = false;
            }
          } catch (error) {
            console.error(`❌ Error getting daily readings for ${site.name}:`, error);
            hasRecentData = false;
          }
        }

        // Process the site if we have valid reading data
        if (latestReading && hasRecentData) {
          // Calculate fuel level percentage correctly
          const fuelLevelPercentage = latestReading?.fuelLevel 
            ? Math.max(0, Math.min(100, parseFloat(latestReading.fuelLevel)))
            : 0;

          // Generator and ZESA state checking - handle different state formats
          const generatorOnline = latestReading.generatorState && 
            ['1', 'on', 'true', '1.0'].includes(latestReading.generatorState.toString().toLowerCase());
          
          const zesaOnline = latestReading.zesaState && 
            ['1', 'on', 'true', '1.0'].includes(latestReading.zesaState.toString().toLowerCase());

          // Alert status calculation
          let alertStatus: 'normal' | 'low_fuel' | 'generator_off' = 'normal';
          if (fuelLevelPercentage < parseFloat(site.lowFuelThreshold)) {
            alertStatus = 'low_fuel';
          } else if (!generatorOnline && fuelLevelPercentage > 0) {
            alertStatus = 'generator_off';
          }

          // Only include sites that have meaningful fuel data
          const hasValidFuelData = fuelLevelPercentage > 0 || 
            (latestReading.fuelVolume && parseFloat(latestReading.fuelVolume) > 0);

          if (hasValidFuelData) {
            sitesWithReadings.push({
              ...site,
              latestReading,
              generatorOnline,
              zesaOnline,
              fuelLevelPercentage,
              alertStatus,
            });
            
            console.log(`✅ Added ${site.name}: ${fuelLevelPercentage.toFixed(1)}% fuel, generator: ${generatorOnline}, zesa: ${zesaOnline}, last fuel update: ${latestReading.capturedAt}`);
          } else {
            console.log(`⏭️ Skipping ${site.name} - no meaningful fuel data (${fuelLevelPercentage}%)`);
            // Add to offline sites if no meaningful fuel data
            offlineSites.push({
              ...site,
              reason: 'No fuel data',
              lastSeen: latestReading.capturedAt
            });
          }
        } else {
          console.log(`📴 Adding ${site.name} to offline sites - no recent readings (hasRecentData: ${hasRecentData})`);
          // Add to offline sites if no recent data
          offlineSites.push({
            ...site,
            reason: hasRecentData === false ? 'No recent sensor data' : 'No readings found',
            lastSeen: latestReading?.capturedAt || null
          });
        }
      }

      // Sort by fuel level descending (highest fuel first)
      sitesWithReadings.sort((a, b) => b.fuelLevelPercentage - a.fuelLevelPercentage);

      // Calculate enhanced system status with ZESA and offline sites
      const systemStatus = {
        sitesOnline: sitesWithReadings.length,
        totalSites: userSites.length,
        lowFuelAlerts: sitesWithReadings.filter(s => s.alertStatus === 'low_fuel').length,
        generatorsRunning: sitesWithReadings.filter(s => s.generatorOnline).length,
        zesaRunning: sitesWithReadings.filter(s => s.zesaOnline).length, // NEW: ZESA running count
        offlineSites: offlineSites.length, // NEW: Offline sites count
      };

      // Generate recent activity with proper timestamps
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

      console.log(`✅ Dashboard complete for ${user.username}:`, {
        totalSitesInDB: userSites.length,
        sitesWithValidData: sitesWithReadings.length,
        offlineSites: offlineSites.length,
        lowFuelAlerts: systemStatus.lowFuelAlerts,
        generatorsRunning: systemStatus.generatorsRunning,
        zesaRunning: systemStatus.zesaRunning, // NEW: Log ZESA count
        viewMode,
        sampleSite: sitesWithReadings[0] ? {
          name: sitesWithReadings[0].name,
          fuelLevel: sitesWithReadings[0].fuelLevelPercentage,
          fuelTimestamp: sitesWithReadings[0].latestReading?.capturedAt,
          generator: sitesWithReadings[0].generatorOnline,
          zesa: sitesWithReadings[0].zesaOnline
        } : null,
        offlineSitesDetails: offlineSites.map(site => ({
          name: site.name,
          deviceId: site.deviceId,
          reason: site.reason,
          lastSeen: site.lastSeen
        }))
      });

      res.json(dashboardData);

    } catch (error) {
      console.error("❌ Dashboard error:", error);
      res.status(500).json({ 
        message: "Dashboard error: " + error.message,
        sites: [],
        systemStatus: { 
          sitesOnline: 0, 
          totalSites: 0, 
          lowFuelAlerts: 0, 
          generatorsRunning: 0,
          zesaRunning: 0,
          offlineSites: 0
        },
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

  // Manual daily closing capture endpoint (admin only)
  app.post("/api/admin/capture-daily-closing", authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
    try {
      console.log(`📋 Manual daily closing capture requested by ${req.user?.username}`);
      
      const db = getDb();
      const captureResults = await captureDailyClosingReadings(db);
      
      res.json({
        message: "Daily closing readings captured successfully",
        timestamp: new Date().toISOString(),
        results: captureResults
      });
    } catch (error) {
      console.error("❌ Error in daily closing capture:", error);
      res.status(500).json({ 
        message: "Failed to capture daily closing readings",
        error: error.message 
      });
    }
  });

  // Enhanced daily closing capture function with proper fuel-focused fallback logic
  async function captureDailyClosingReadings(db: any) {
    console.log('🔄 Starting enhanced daily closing capture...');

    // Get all distinct device IDs from sensor_readings table
    const distinctDevices = await db.execute(sql`
      SELECT DISTINCT device_id FROM sensor_readings ORDER BY device_id
    `);

    console.log(`📊 Found ${distinctDevices.rows.length} distinct devices in sensor_readings`);

    const results = {
      totalDevices: distinctDevices.rows.length,
      successfulCaptures: 0,
      failedCaptures: 0,
      skippedCaptures: 0,
      captures: [] as any[]
    };

    for (const deviceRow of distinctDevices.rows) {
      const deviceId = deviceRow.device_id;
      
      try {
        // Get or create site for this device
        let site = await db
          .select()
          .from(sites)
          .where(eq(sites.deviceId, deviceId))
          .limit(1);

        if (site.length === 0) {
          // Create site if it doesn't exist
          const newSiteResult = await db
            .insert(sites)
            .values({
              name: deviceId.replace(/^simbisa-/, '').replace(/-/g, ' ').toUpperCase(),
              location: `Auto-generated location for ${deviceId}`,
              deviceId: deviceId,
              fuelCapacity: '2000.00',
              lowFuelThreshold: '25.00',
              isActive: true,
            })
            .returning();

          site = newSiteResult;
          console.log(`✅ Created new site for device: ${deviceId}`);
        }

        const siteData = site[0];
        
        // Check if we already have a closing reading for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const existingReading = await db
          .select()
          .from(dailyClosingReadings)
          .where(
            and(
              eq(dailyClosingReadings.siteId, siteData.id),
              sql`${dailyClosingReadings.capturedAt} >= ${today}`,
              sql`${dailyClosingReadings.capturedAt} < ${tomorrow}`
            )
          )
          .limit(1);

        if (existingReading.length > 0) {
          console.log(`⏭️ Daily reading already exists for ${deviceId} today, skipping...`);
          results.skippedCaptures++;
          results.captures.push({
            deviceId,
            status: 'SKIPPED',
            reason: 'Reading already exists for today',
            existingCaptureTime: existingReading[0].capturedAt
          });
          continue;
        }

        // Try to capture reading with fallback logic
        const captureResult = await captureReadingWithFallback(db, siteData, deviceId);
        
        if (captureResult.success) {
          results.successfulCaptures++;
        } else {
          results.failedCaptures++;
        }
        
        results.captures.push(captureResult);
        
      } catch (error) {
        console.error(`❌ Error processing device ${deviceId}:`, error);
        results.failedCaptures++;
        results.captures.push({
          deviceId,
          status: 'ERROR',
          reason: error.message
        });
      }
    }

    console.log(`🎉 Daily closing capture completed:`, {
      total: results.totalDevices,
      successful: results.successfulCaptures,
      failed: results.failedCaptures,
      skipped: results.skippedCaptures
    });

    return results;
  }

  // Enhanced capture function with proper fuel-focused fallback logic
  async function captureReadingWithFallback(db: any, siteData: any, deviceId: string) {
    console.log(`🔍 Capturing reading for site: ${siteData.name} (${deviceId})`);

    try {
      // Step 1: Try to find readings in the closing window (20:55 to 23:55 today)
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Closing window: 20:55 to 23:55 today
      const closingStart = new Date(today);
      closingStart.setHours(20, 55, 0, 0);
      const closingEnd = new Date(today);
      closingEnd.setHours(23, 55, 0, 0);

      let captureResult = await findReadingInWindow(db, deviceId, closingStart, closingEnd, 'CLOSING_WINDOW');
      
      if (captureResult.readings.length > 0 && typeof captureResult.fuelLevel === 'number') {
        await saveClosingReading(db, siteData, deviceId, captureResult);
        return {
          deviceId,
          status: 'SUCCESS',
          method: 'CLOSING_WINDOW',
          capturedAt: captureResult.capturedAt,
          fuelLevel: captureResult.fuelLevel,
          success: true
        };
      }

      // Step 2: Try to find readings from anywhere today
      const dayStart = new Date(today);
      const dayEnd = new Date(today);
      dayEnd.setHours(23, 59, 59, 999);
      
      captureResult = await findReadingInWindow(db, deviceId, dayStart, dayEnd, 'SAME_DAY');
      
      if (captureResult.readings.length > 0 && typeof captureResult.fuelLevel === 'number') {
        await saveClosingReading(db, siteData, deviceId, captureResult);
        return {
          deviceId,
          status: 'SUCCESS',
          method: 'SAME_DAY',
          capturedAt: captureResult.capturedAt,
          fuelLevel: captureResult.fuelLevel,
          success: true
        };
      }

      // Step 3: Try previous days (up to 7 days back)
      for (let daysBack = 1; daysBack <= 7; daysBack++) {
        const lookbackDate = new Date(today);
        lookbackDate.setDate(lookbackDate.getDate() - daysBack);
        
        const lookbackStart = new Date(lookbackDate);
        lookbackStart.setHours(0, 0, 0, 0);
        const lookbackEnd = new Date(lookbackDate);
        lookbackEnd.setHours(23, 59, 59, 999);

        captureResult = await findReadingInWindow(db, deviceId, lookbackStart, lookbackEnd, `PREVIOUS_DAY_${daysBack}`);
        
        if (captureResult.readings.length > 0 && typeof captureResult.fuelLevel === 'number') {
          await saveClosingReading(db, siteData, deviceId, captureResult);
          return {
            deviceId,
            status: 'SUCCESS',
            method: `PREVIOUS_DAY_${daysBack}`,
            capturedAt: captureResult.capturedAt,
            fuelLevel: captureResult.fuelLevel,
            daysBack: daysBack,
            success: true
          };
        }
      }

      // Step 4: Get the very last available FUEL reading (no time limit) - THIS IS THE KEY FIX
      captureResult = await getLastAvailableFuelReading(db, deviceId);
      
      if (captureResult.readings.length > 0 && typeof captureResult.fuelLevel === 'number') {
        await saveClosingReading(db, siteData, deviceId, captureResult);
        
        // Calculate how many days ago this reading was
        const readingDate = new Date(captureResult.capturedAt);
        const daysAgo = Math.floor((now.getTime() - readingDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          deviceId,
          status: 'SUCCESS',
          method: 'LAST_AVAILABLE_FUEL',
          capturedAt: captureResult.capturedAt,
          fuelLevel: captureResult.fuelLevel,
          daysOld: daysAgo,
          warning: `Used fuel reading from ${daysAgo} days ago (${captureResult.capturedAt.toISOString()})`,
          success: true
        };
      }

      // Step 5: No fuel readings found anywhere
      console.log(`❌ No fuel readings found for device ${deviceId} in the entire database`);
      return {
        deviceId,
        status: 'NO_FUEL_READINGS',
        reason: 'No fuel sensor readings found in database for this device',
        success: false
      };

    } catch (error) {
      console.error(`❌ Error in fallback capture for ${deviceId}:`, error);
      return {
        deviceId,
        status: 'ERROR',
        reason: error.message,
        success: false
      };
    }
  }

  // FIXED: Focused function to get the very last available FUEL reading
  async function getLastAvailableFuelReading(db: any, deviceId: string) {
    console.log(`🔍 Getting LAST AVAILABLE FUEL reading for ${deviceId} (no time limit)`);

    // Focus on fuel readings first - get the most recent fuel_level reading
    const lastFuelReading = await db.execute(sql`
      SELECT time, device_id, sensor_name, value, unit 
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name = 'fuel_sensor_level'
        AND value IS NOT NULL
      ORDER BY time DESC
      LIMIT 1
    `);

    if (lastFuelReading.rows.length === 0) {
      console.log(`❌ No fuel_sensor_level readings found for ${deviceId}`);
      return { readings: [], method: 'LAST_AVAILABLE_FUEL' };
    }

    const fuelRow = lastFuelReading.rows[0];
    const fuelTimestamp = new Date(fuelRow.time);
    
    console.log(`✅ Found last fuel reading for ${deviceId}:`, {
      timestamp: fuelTimestamp.toISOString(),
      fuelLevel: fuelRow.value,
      daysAgo: Math.floor((new Date().getTime() - fuelTimestamp.getTime()) / (1000 * 60 * 60 * 24))
    });

    // Now try to get companion readings from around the same time (within 1 hour window)
    const timeWindow = 60 * 60 * 1000; // 1 hour in milliseconds
    const windowStart = new Date(fuelTimestamp.getTime() - timeWindow);
    const windowEnd = new Date(fuelTimestamp.getTime() + timeWindow);

    const companionReadings = await db.execute(sql`
      SELECT DISTINCT ON (sensor_name) 
        time, device_id, sensor_name, value, unit 
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND time >= ${windowStart.toISOString()}
        AND time <= ${windowEnd.toISOString()}
        AND sensor_name IN ('fuel_sensor_volume', 'fuel_sensor_temp', 'fuel_sensor_temperature', 'generator_state', 'zesa_state')
        AND value IS NOT NULL
      ORDER BY sensor_name, time DESC
    `);

    // Combine fuel reading with companion readings
    const allReadings = [fuelRow, ...companionReadings.rows];
    
    // Convert to map for easy lookup
    const sensorMap = new Map();
    for (const row of allReadings) {
      sensorMap.set(row.sensor_name, row);
    }

    const fuelLevelRow = sensorMap.get('fuel_sensor_level');
    const fuelVolumeRow = sensorMap.get('fuel_sensor_volume');
    const tempRow = sensorMap.get('fuel_sensor_temp') || sensorMap.get('fuel_sensor_temperature');
    const generatorRow = sensorMap.get('generator_state');
    const zesaRow = sensorMap.get('zesa_state');

    // CRITICAL: Use the actual timestamp from the fuel level reading
    const capturedAt = new Date(fuelLevelRow.time);

    console.log(`📊 Assembled reading for ${deviceId}:`, {
      capturedAt: capturedAt.toISOString(),
      fuelLevel: `${fuelLevelRow.value} (${typeof parseFloat(fuelLevelRow.value)})`,
      fuelVolume: fuelVolumeRow?.value || 'N/A',
      temperature: tempRow?.value || 'N/A',
      generator: generatorRow?.value || 'unknown',
      zesa: zesaRow?.value || 'unknown'
    });

    return {
      readings: allReadings,
      method: 'LAST_AVAILABLE_FUEL',
      capturedAt,
      fuelLevel: parseFloat(fuelLevelRow.value),
      fuelVolume: fuelVolumeRow ? parseFloat(fuelVolumeRow.value) : null,
      temperature: tempRow ? parseFloat(tempRow.value) : null,
      generatorState: generatorRow ? generatorRow.value.toString() : 'unknown',
      zesaState: zesaRow ? zesaRow.value.toString() : 'unknown'
    };
  }

  // UPDATED: Helper function to find readings in a specific time window - prioritize fuel readings
  async function findReadingInWindow(db: any, deviceId: string, startTime: Date, endTime: Date, method: string) {
    console.log(`🔍 Looking for ${method} readings for ${deviceId} between ${startTime.toISOString()} and ${endTime.toISOString()}`);

    // First, check if there are any fuel readings in this window
    const fuelCheck = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND time >= ${startTime.toISOString()}
        AND time <= ${endTime.toISOString()}
        AND sensor_name = 'fuel_sensor_level'
        AND value IS NOT NULL
    `);

    if (fuelCheck.rows[0].count === 0) {
      console.log(`⚠️ No fuel readings found in ${method} window for ${deviceId}`);
      return { readings: [], method };
    }

    // Get the latest readings for each sensor type in the time window
    const sensorReadings = await db.execute(sql`
      SELECT DISTINCT ON (device_id, sensor_name) 
        time, device_id, sensor_name, value, unit 
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND time >= ${startTime.toISOString()}
        AND time <= ${endTime.toISOString()}
        AND sensor_name IN ('fuel_sensor_level', 'fuel_sensor_volume', 'fuel_sensor_temp', 'fuel_sensor_temperature', 'generator_state', 'zesa_state')
        AND value IS NOT NULL
      ORDER BY device_id, sensor_name, time DESC
    `);

    if (sensorReadings.rows.length === 0) {
      return { readings: [], method };
    }

    console.log(`📊 Found ${sensorReadings.rows.length} sensor readings for ${deviceId} using ${method}`);

    // Convert to map for easy lookup
    const sensorMap = new Map();
    let latestFuelTime = new Date(0); // Track latest fuel sensor time

    for (const row of sensorReadings.rows) {
      sensorMap.set(row.sensor_name, row);
      
      // Track the latest fuel sensor time as the primary timestamp
      if (row.sensor_name === 'fuel_sensor_level') {
        const readingTime = new Date(row.time);
        if (readingTime > latestFuelTime) {
          latestFuelTime = readingTime;
        }
      }
    }

    // Extract sensor values
    const fuelLevelRow = sensorMap.get('fuel_sensor_level');
    const fuelVolumeRow = sensorMap.get('fuel_sensor_volume');
    const tempRow = sensorMap.get('fuel_sensor_temp') || sensorMap.get('fuel_sensor_temperature');
    const generatorRow = sensorMap.get('generator_state');
    const zesaRow = sensorMap.get('zesa_state');

    // Use the original timestamp from the fuel level sensor
    const capturedAt = fuelLevelRow ? new Date(fuelLevelRow.time) : latestFuelTime;

    return {
      readings: sensorReadings.rows,
      method,
      capturedAt,
      fuelLevel: fuelLevelRow ? parseFloat(fuelLevelRow.value) : null,
      fuelVolume: fuelVolumeRow ? parseFloat(fuelVolumeRow.value) : null,
      temperature: tempRow ? parseFloat(tempRow.value) : null,
      generatorState: generatorRow ? generatorRow.value.toString() : 'unknown',
      zesaState: zesaRow ? zesaRow.value.toString() : 'unknown'
    };
  }

  // UPDATED: Helper function to save the closing reading with better logging
  async function saveClosingReading(db: any, siteData: any, deviceId: string, captureResult: any) {
    // Use the original timestamp from the sensor reading
    const originalTimestamp = captureResult.capturedAt;

    const insertData = {
      siteId: siteData.id,
      deviceId: deviceId,
      fuelLevel: typeof captureResult.fuelLevel === 'number' ? captureResult.fuelLevel.toFixed(2) : null,
      fuelVolume: typeof captureResult.fuelVolume === 'number' ? captureResult.fuelVolume.toFixed(2) : null,
      temperature: captureResult.temperature ? captureResult.temperature.toFixed(2) : null,
      generatorState: captureResult.generatorState || 'unknown',
      zesaState: captureResult.zesaState || 'unknown',
      capturedAt: originalTimestamp, // CRITICAL: Use original sensor timestamp, not current time
    };

    await db.insert(dailyClosingReadings).values(insertData);

    const daysAgo = Math.floor((new Date().getTime() - originalTimestamp.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`✅ Daily reading saved for ${siteData.name}:`, {
      fuel: insertData.fuelLevel ? `${insertData.fuelLevel}%` : 'N/A',
      volume: insertData.fuelVolume ? `${insertData.fuelVolume}L` : 'N/A',
      temp: insertData.temperature ? `${insertData.temperature}°C` : 'N/A',
      generator: insertData.generatorState,
      zesa: insertData.zesaState,
      originalTimestamp: originalTimestamp.toISOString(),
      method: captureResult.method,
      daysOld: daysAgo > 0 ? `${daysAgo} days ago` : 'today'
    });
  }

  
  const httpServer = createServer(app);
  return httpServer;
}