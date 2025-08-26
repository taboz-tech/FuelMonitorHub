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
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.connect();
    }

    this.isConnecting = true;

    try {
      await this.disconnect();

      if (process.env.SSH_HOST && process.env.SSH_USERNAME) {
        console.log('Establishing SSH tunnel...');
        await this.createSSHTunnel();
        console.log('SSH tunnel established successfully');
      }

      const dbConfig = {
        host: '127.0.0.1',
        port: this.tunnelPort,
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || 's3rv3r5mxdb',
        database: process.env.DB_NAME || 'sensorsdb',
        ssl: false,
        connectTimeoutMS: 10000,
        idleTimeoutMS: 30000,
      };

      console.log('Connecting to PostgreSQL through SSH tunnel...');
      
      this.pgClient = new Client(dbConfig);
      
      this.pgClient.on('error', (err) => {
        console.error('PostgreSQL client error:', err);
        this.db = null;
        this.pgClient = null;
        setTimeout(() => {
          console.log('Attempting to reconnect after error...');
          this.connect().catch(console.error);
        }, 5000);
      });

      await this.pgClient.connect();
      console.log('PostgreSQL connected successfully');
      
      this.db = drizzle(this.pgClient, { schema });

      // Create tables and FAST auto-create sites
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
        
        this.localServer = net.createServer((clientSocket) => {
          this.sshClient!.forwardOut(
            '127.0.0.1',
            0,
            process.env.REMOTE_BIND_HOST || '127.0.0.1',
            parseInt(process.env.REMOTE_BIND_PORT || '5437'),
            (err, stream) => {
              if (err) {
                console.error('SSH forward error:', err);
                clientSocket.end();
                return;
              }
              
              clientSocket.pipe(stream);
              stream.pipe(clientSocket);
              
              stream.on('close', () => clientSocket.end());
              clientSocket.on('close', () => stream.close());
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

    console.log('Creating application tables and FAST auto-creating sites...');

    const createTablesSQL = `
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

      CREATE TABLE IF NOT EXISTS user_site_assignments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, site_id)
      );

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

      CREATE TABLE IF NOT EXISTS admin_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        view_mode TEXT NOT NULL DEFAULT 'closing',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      );

      CREATE TABLE IF NOT EXISTS cumulative_readings (
        id SERIAL PRIMARY KEY,
        site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL,
        date TEXT NOT NULL,
        total_fuel_consumed DECIMAL(10,2) DEFAULT 0,
        total_fuel_topped_up DECIMAL(10,2) DEFAULT 0,
        fuel_consumed_percent DECIMAL(5,2) DEFAULT 0,
        fuel_topped_up_percent DECIMAL(5,2) DEFAULT 0,
        total_generator_runtime DECIMAL(10,2) DEFAULT 0,
        total_zesa_runtime DECIMAL(10,2) DEFAULT 0,
        total_offline_time DECIMAL(10,2) DEFAULT 0,
        calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(site_id, date)
      );

      INSERT INTO users (username, email, password, role, full_name)
      VALUES ('admin', 'admin@fuelmonitor.com', '$2b$10$.XgW4LNBHnMqCnGczUy5/etAp/KCsAYtTexha2Nn5toSsU.2ai6v.', 'admin', 'System Administrator')
      ON CONFLICT (username) DO NOTHING;

      INSERT INTO users (username, email, password, role, full_name, is_active)
      VALUES 
        ('manager1', 'manager1@fuelmonitor.com', '$2b$10$.XgW4LNBHnMqCnGczUy5/etAp/KCsAYtTexha2Nn5toSsU.2ai6v.', 'manager', 'John Manager', true),
        ('supervisor1', 'supervisor1@fuelmonitor.com', '$2b$10$.XgW4LNBHnMqCnGczUy5/etAp/KCsAYtTexha2Nn5toSsU.2ai6v.', 'supervisor', 'Jane Supervisor', true)
      ON CONFLICT (username) DO NOTHING;
    `;

    try {
      await this.pgClient.query(createTablesSQL);
      console.log('✅ Application tables created successfully');
      
      // FAST auto-create sites - only distinct devices
      await this.fastAutoCreateSites();
      
    } catch (error) {
      console.error('❌ Error creating tables:', error);
      throw error;
    }
  }

  private async fastAutoCreateSites() {
    if (!this.pgClient) return;

    try {
      console.log('🚀 FAST auto-creating sites from sensor_readings...');

      // Check if sensor_readings exists
      const tableExists = await this.pgClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'sensor_readings'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        console.log('⚠️ sensor_readings table not found');
        return;
      }

      // FAST query - only get distinct device_ids (no reading all records)
      const distinctDevices = await this.pgClient.query(`
        SELECT DISTINCT device_id FROM sensor_readings ORDER BY device_id
      `);
      
      console.log(`📊 Found ${distinctDevices.rows.length} distinct devices`);

      if (distinctDevices.rows.length === 0) {
        console.log('⚠️ No devices found in sensor_readings');
        return;
      }

      let createdCount = 0;
      for (const row of distinctDevices.rows) {
        const deviceId = row.device_id;
        
        try {
          // Check if site already exists
          const existing = await this.pgClient.query(
            'SELECT id FROM sites WHERE device_id = $1', 
            [deviceId]
          );

          if (existing.rows.length === 0) {
            // Use device_id as-is for both name and location
            const siteName = deviceId;  // Keep exact: simbisa-avondale
            const siteLocation = deviceId + ' location';  // simbisa-avondale location

            await this.pgClient.query(`
              INSERT INTO sites (name, location, device_id, fuel_capacity, low_fuel_threshold, is_active)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [siteName, siteLocation, deviceId, 2000.00, 25.00, true]);

            console.log(`✅ Created: ${siteName} (${deviceId})`);
            createdCount++;
          }
        } catch (siteError) {
          console.error(`❌ Error creating site for ${deviceId}:`, siteError);
        }
      }

      if (createdCount > 0) {
        console.log(`🎉 FAST created ${createdCount} sites from ${distinctDevices.rows.length} sensor devices`);
      } else {
        console.log('ℹ️ All sensor devices already have sites');
      }

    } catch (error) {
      console.error('❌ Error in fastAutoCreateSites:', error);
    }
  }

  async testConnection() {
    try {
      if (!this.pgClient) {
        await this.connect();
      }
      
      const result = await this.pgClient!.query('SELECT NOW() as current_time');
      console.log('✅ Database connection test successful:', result.rows[0].current_time);
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