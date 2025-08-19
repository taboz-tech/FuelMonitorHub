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
import { eq, desc, and, inArray, sql } from "drizzle-orm";

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
      // If we get here, the token is valid (authenticateToken middleware passed)
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
          if (!dbConnection.db) {
            await dbConnection.connect();
          }
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

  // User management endpoints (admin only)
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
        .from(users);

      res.json(allUsers);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const db = getDb();

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
          createdAt: users.createdAt,
        });

      res.json(newUser[0]);
    } catch (error) {
      console.error("Create user error:", error);
      res.status(400).json({ message: "Failed to create user" });
    }
  });

  // Sites endpoints
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

  // Dashboard data endpoint
  app.get("/api/dashboard", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const db = getDb();
      const user = req.user!;

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

      // Get sites based on user role
      let userSites;
      if (user.role === 'admin') {
        userSites = await db.select().from(sites).where(eq(sites.isActive, true));
      } else {
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
              inArray(sites.id, assignedSiteIds.map(a => a.siteId))
            )
          );
      }

      // Get latest readings for each site
      const sitesWithReadings: SiteWithReadings[] = [];
      
      for (const site of userSites) {
        let latestReading;
        
        if (viewMode === 'realtime' && user.role === 'admin') {
          // Get real-time data from sensor_readings
          const realtimeReadings = await db
            .select()
            .from(sensorReadings)
            .where(eq(sensorReadings.deviceId, site.deviceId))
            .orderBy(desc(sensorReadings.time))
            .limit(10);

          // Convert real-time readings to daily reading format
          const fuelLevel = realtimeReadings.find(r => r.sensorName === 'fuel_sensor_level')?.value || 0;
          const fuelVolume = realtimeReadings.find(r => r.sensorName === 'fuel_sensor_volume')?.value || 0;
          const temperature = realtimeReadings.find(r => r.sensorName === 'fuel_sensor_temperature')?.value || 0;
          const generatorState = realtimeReadings.find(r => r.sensorName === 'generator_state')?.value?.toString() || 'unknown';
          const zesaState = realtimeReadings.find(r => r.sensorName === 'zesa_state')?.value?.toString() || 'unknown';

          latestReading = {
            id: 0,
            siteId: site.id,
            deviceId: site.deviceId,
            fuelLevel: fuelLevel.toString(),
            fuelVolume: fuelVolume.toString(),
            temperature: temperature.toString(),
            generatorState,
            zesaState,
            capturedAt: new Date(),
            createdAt: new Date(),
          };
        } else {
          // Get daily closing readings
          const closingReading = await db
            .select()
            .from(dailyClosingReadings)
            .where(eq(dailyClosingReadings.siteId, site.id))
            .orderBy(desc(dailyClosingReadings.capturedAt))
            .limit(1);

          latestReading = closingReading.length > 0 ? closingReading[0] : null;
        }

        const fuelLevelPercentage = latestReading ? parseFloat(latestReading.fuelLevel || '0') : 0;
        const generatorOnline = latestReading?.generatorState === 'on' || latestReading?.generatorState === '1';
        const zesaOnline = latestReading?.zesaState === 'on' || latestReading?.zesaState === '1';
        
        let alertStatus: 'normal' | 'low_fuel' | 'generator_off' = 'normal';
        if (fuelLevelPercentage < parseFloat(site.lowFuelThreshold)) {
          alertStatus = 'low_fuel';
        } else if (!generatorOnline) {
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

      // Calculate system status
      const systemStatus = {
        sitesOnline: sitesWithReadings.length,
        totalSites: sitesWithReadings.length,
        lowFuelAlerts: sitesWithReadings.filter(s => s.alertStatus === 'low_fuel').length,
        generatorsRunning: sitesWithReadings.filter(s => s.generatorOnline).length,
      };

      // Get recent activity
      const recentActivity = sitesWithReadings.slice(0, 5).map((site, index) => ({
        id: index + 1,
        siteId: site.id,
        siteName: site.name,
        event: site.alertStatus === 'low_fuel' ? 'Low Fuel Alert' : 'Daily Reading Captured',
        value: `${site.fuelLevelPercentage}% (${site.latestReading?.fuelVolume || '0'}L)`,
        timestamp: site.latestReading?.capturedAt || new Date(),
        status: site.alertStatus === 'low_fuel' ? 'Low Fuel' : 'Normal',
      }));

      const dashboardData: DashboardData & { viewMode: string } = {
        sites: sitesWithReadings,
        systemStatus,
        recentActivity,
        viewMode,
      };

      res.json(dashboardData);
    } catch (error) {
      console.error("Get dashboard error:", error);
      res.status(500).json({ message: "Internal server error" });
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
