import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { Client as SSHClient } from 'ssh2';
import * as net from 'net';
import * as schema from '@shared/schema';

class DatabaseConnection {
  private pgClient: Client | null = null;
  private db: ReturnType<typeof drizzle> | null = null;
  private sshClient: SSHClient | null = null;
  private localServer: net.Server | null = null;
  private isConnecting: boolean = false;
  private tunnelPort: number = 5432;

  async connect() {
    if (this.db && this.pgClient && !this.pgClient.ended) return this.db;
    
    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.connect();
    }

    this.isConnecting = true;

    try {
      // Clean up existing connections if needed
      await this.disconnect();

      // First establish SSH tunnel if we have SSH configuration
      if (process.env.SSH_HOST && process.env.SSH_USERNAME) {
        console.log('Establishing SSH tunnel...');
        await this.createSSHTunnel();
        console.log('SSH tunnel established successfully');
      }

      // Database configuration - connect through SSH tunnel
      const dbConfig = {
        host: '127.0.0.1',
        port: this.tunnelPort,
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || 's3rv3r5mxdb',
        database: process.env.DB_NAME || 'sensorsdb',
        ssl: false, // No SSL through SSH tunnel
        connectTimeoutMS: 10000,
        idleTimeoutMS: 30000,
      };

      console.log('Connecting to PostgreSQL through SSH tunnel...');
      
      // Create PostgreSQL client with error handling
      this.pgClient = new Client(dbConfig);
      
      // Add error handler to prevent crashes and auto-reconnect
      this.pgClient.on('error', (err) => {
        console.error('PostgreSQL client error:', err);
        // Reset connection on error
        this.db = null;
        this.pgClient = null;
        // Auto-reconnect after 5 seconds
        setTimeout(() => {
          console.log('Attempting to reconnect after error...');
          this.connect().catch(console.error);
        }, 5000);
      });

      await this.pgClient.connect();
      console.log('PostgreSQL connected successfully');
      
      this.db = drizzle(this.pgClient, { schema });

      // Create tables if they don't exist
      await this.createTables();

      console.log('Database connected and initialized successfully');
      return this.db;
    } catch (error) {
      console.error('Database connection failed:', error);
      await this.disconnect();
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async createSSHTunnel(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sshClient = new SSHClient();
      
      this.sshClient.on('ready', () => {
        console.log('SSH connection established');
        
        // Create a local server to listen for database connections
        this.localServer = net.createServer((clientSocket) => {
          console.log('Local connection received, forwarding through SSH tunnel');
          
          // Forward the connection through SSH tunnel
          this.sshClient!.forwardOut(
            '127.0.0.1', // source host
            0, // source port (0 = random)
            process.env.REMOTE_BIND_HOST || '127.0.0.1', // destination host on remote server
            parseInt(process.env.REMOTE_BIND_PORT || '5437'), // destination port on remote server
            (err, stream) => {
              if (err) {
                console.error('SSH forward error:', err);
                clientSocket.end();
                return;
              }
              
              console.log('SSH stream created, piping data');
              
              // Pipe data between client socket and SSH stream
              clientSocket.pipe(stream);
              stream.pipe(clientSocket);
              
              // Handle connection cleanup
              stream.on('close', () => {
                console.log('SSH stream closed');
                clientSocket.end();
              });
              
              clientSocket.on('close', () => {
                console.log('Client socket closed');
                stream.close();
              });
              
              stream.on('error', (err: any) => {
                console.error('SSH stream error:', err);
                clientSocket.end();
              });
              
              clientSocket.on('error', (err: any) => {
                console.error('Client socket error:', err);
                stream.close();
              });
            }
          );
        });
        
        // Start listening on local port
        this.localServer.listen(this.tunnelPort, '127.0.0.1', () => {
          console.log(`SSH tunnel listening on local port ${this.tunnelPort}`);
          resolve();
        });
        
        this.localServer.on('error', (err) => {
          console.error('Local server error:', err);
          reject(err);
        });
      });

      this.sshClient.on('error', (err) => {
        console.error('SSH connection error:', err);
        reject(err);
      });

      // Connect to SSH server
      console.log(`Connecting to SSH server: ${process.env.SSH_HOST}:22`);
      this.sshClient.connect({
        host: process.env.SSH_HOST,
        username: process.env.SSH_USERNAME,
        password: process.env.SSH_PASSWORD,
        port: 22,
        readyTimeout: 30000,
        keepaliveInterval: 60000,
      });
    });
  }

  private async createTables() {
    if (!this.pgClient) return;

    console.log('Creating application tables (not sensor_readings - that exists)...');

    const createTablesSQL = `
      -- Create users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        full_name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create sites table
      CREATE TABLE IF NOT EXISTS sites (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        device_id TEXT NOT NULL UNIQUE,
        fuel_capacity DECIMAL(10,2) NOT NULL,
        low_fuel_threshold DECIMAL(5,2) NOT NULL DEFAULT 25,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create user site assignments
      CREATE TABLE IF NOT EXISTS user_site_assignments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, site_id)
      );

      -- Create daily closing readings
      CREATE TABLE IF NOT EXISTS daily_closing_readings (
        id SERIAL PRIMARY KEY,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL,
        fuel_level DECIMAL(5,2),
        fuel_volume DECIMAL(10,2),
        temperature DECIMAL(5,2),
        generator_state TEXT,
        zesa_state TEXT,
        captured_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create admin preferences
      CREATE TABLE IF NOT EXISTS admin_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        view_mode TEXT NOT NULL DEFAULT 'closing',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      );

      -- Create default admin user if not exists
      INSERT INTO users (username, email, password, role, full_name)
      VALUES ('admin', 'admin@fuelmonitor.com', '$2b$10$.XgW4LNBHnMqCnGczUy5/etAp/KCsAYtTexha2Nn5toSsU.2ai6v.', 'admin', 'System Administrator')
      ON CONFLICT (username) DO NOTHING;

      -- Create some sample users for testing (password: secret)
      INSERT INTO users (username, email, password, role, full_name, is_active)
      VALUES 
        ('manager1', 'manager1@fuelmonitor.com', '$2b$10$.XgW4LNBHnMqCnGczUy5/etAp/KCsAYtTexha2Nn5toSsU.2ai6v.', 'manager', 'John Manager', true),
        ('supervisor1', 'supervisor1@fuelmonitor.com', '$2b$10$.XgW4LNBHnMqCnGczUy5/etAp/KCsAYtTexha2Nn5toSsU.2ai6v.', 'supervisor', 'Jane Supervisor', true)
      ON CONFLICT (username) DO NOTHING;
    `;

    try {
      await this.pgClient.query(createTablesSQL);
      console.log('✅ Application tables created successfully');
      
      // Auto-create sites from existing sensor_readings data
      await this.autoCreateSitesFromSensorData();
      
    } catch (error) {
      console.error('❌ Error creating tables:', error);
      throw error;
    }
  }

  private async autoCreateSitesFromSensorData() {
    if (!this.pgClient) return;

    try {
      console.log('🔍 Checking for sites to auto-create from sensor_readings...');

      // Check if sensor_readings table exists
      const tableExistsQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'sensor_readings'
        );
      `;
      
      const tableExists = await this.pgClient.query(tableExistsQuery);
      
      if (!tableExists.rows[0].exists) {
        console.log('⚠️ sensor_readings table does not exist - skipping site auto-creation');
        return;
      }

      // Get distinct device IDs from sensor_readings
      const distinctDevicesQuery = 'SELECT DISTINCT device_id FROM sensor_readings LIMIT 20';
      const result = await this.pgClient.query(distinctDevicesQuery);
      
      console.log(`📊 Found ${result.rows.length} distinct devices in sensor_readings`);

      if (result.rows.length === 0) {
        console.log('⚠️ No device data found in sensor_readings');
        return;
      }

      // Create sites for devices that don't already have sites
      let createdCount = 0;
      for (const row of result.rows) {
        const deviceId = row.device_id;
        
        try {
          // Check if site already exists
          const existingSite = await this.pgClient.query(
            'SELECT id FROM sites WHERE device_id = $1', 
            [deviceId]
          );

          if (existingSite.rows.length === 0) {
            // Create site
            const siteName = deviceId.replace('simbisa-', '').replace(/[-_]/g, ' ').toUpperCase() + ' Site';
            const siteLocation = deviceId.replace('simbisa-', '').replace(/[-_]/g, ' ').toUpperCase() + ' Location';

            await this.pgClient.query(`
              INSERT INTO sites (name, location, device_id, fuel_capacity, low_fuel_threshold, is_active)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [siteName, siteLocation, deviceId, 2000.00, 25.00, true]);

            console.log(`✅ Created site: ${siteName} for device ${deviceId}`);
            createdCount++;
          }
        } catch (siteError) {
          console.error(`❌ Error creating site for device ${deviceId}:`, siteError);
        }
      }

      if (createdCount > 0) {
        console.log(`🎉 Auto-created ${createdCount} sites from sensor_readings data`);
      } else {
        console.log('ℹ️ All sites already exist for current sensor devices');
      }

    } catch (error) {
      console.error('❌ Error in autoCreateSitesFromSensorData:', error);
      // Don't throw - this is not critical for app startup
    }
  }

  async testConnection() {
    try {
      if (!this.pgClient) {
        await this.connect();
      }
      
      // Test the connection with a simple query
      const result = await this.pgClient!.query('SELECT NOW() as current_time, version() as db_version');
      console.log('✅ Database connection test successful:', {
        currentTime: result.rows[0].current_time,
        version: result.rows[0].db_version.substring(0, 50) + '...'
      });
      
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error);
      return false;
    }
  }

  async disconnect() {
    console.log('🔌 Disconnecting from database...');
    
    if (this.pgClient) {
      try {
        await this.pgClient.end();
        console.log('✅ PostgreSQL connection closed');
      } catch (error) {
        console.error('❌ Error closing PostgreSQL connection:', error);
      }
      this.pgClient = null;
    }
    
    if (this.localServer) {
      try {
        this.localServer.close();
        console.log('✅ Local SSH tunnel server closed');
      } catch (error) {
        console.error('❌ Error closing local server:', error);
      }
      this.localServer = null;
    }
    
    if (this.sshClient) {
      try {
        this.sshClient.end();
        console.log('✅ SSH connection closed');
      } catch (error) {
        console.error('❌ Error closing SSH connection:', error);
      }
      this.sshClient = null;
    }
    
    this.db = null;
  }

  getDb() {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  // Utility method to get connection status
  getStatus() {
    return {
      isConnected: !!(this.db && this.pgClient && !this.pgClient.ended),
      hasSSHTunnel: !!this.sshClient,
      hasLocalServer: !!this.localServer,
    };
  }
}

export const dbConnection = new DatabaseConnection();
export const getDb = () => dbConnection.getDb();

// Add graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing database connections...');
  await dbConnection.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, closing database connections...');
  await dbConnection.disconnect();
  process.exit(0);
});