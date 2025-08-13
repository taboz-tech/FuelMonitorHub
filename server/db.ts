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

      // Database configuration
      const dbConfig = {
        connectionString: process.env.DATABASE_URL,
      };

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
      
      this.db = drizzle(this.pgClient, { schema });

      // Create tables if they don't exist
      await this.createTables();

      console.log('Database connected successfully');
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
      });
    });
  }

  private async createTables() {
    if (!this.pgClient) return;

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
        user_id INTEGER NOT NULL REFERENCES users(id),
        site_id INTEGER NOT NULL REFERENCES sites(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS daily_closing_readings (
        id SERIAL PRIMARY KEY,
        site_id INTEGER NOT NULL REFERENCES sites(id),
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
        user_id INTEGER NOT NULL REFERENCES users(id),
        view_mode TEXT NOT NULL DEFAULT 'closing',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create default admin user if not exists
      INSERT INTO users (username, email, password, role, full_name)
      VALUES ('admin', 'admin@fuelmonitor.com', '$2b$10$.XgW4LNBHnMqCnGczUy5/etAp/KCsAYtTexha2Nn5toSsU.2ai6v.', 'admin', 'System Administrator')
      ON CONFLICT (username) DO NOTHING;

      -- Create sample sites if not exists
      INSERT INTO sites (name, location, device_id, fuel_capacity, low_fuel_threshold)
      VALUES 
        ('Main Site A', 'Harare Branch', 'DEVICE_001', 2000.00, 25.00),
        ('Site B', 'Bulawayo Branch', 'DEVICE_002', 2000.00, 25.00),
        ('Site C', 'Mutare Branch', 'DEVICE_003', 2000.00, 25.00),
        ('Site D', 'Gweru Branch', 'DEVICE_004', 2000.00, 25.00)
      ON CONFLICT (device_id) DO NOTHING;
    `;

    try {
      await this.pgClient.query(createTablesSQL);
      console.log('Database tables created successfully');
    } catch (error) {
      console.error('Error creating tables:', error);
    }
  }

  async disconnect() {
    if (this.pgClient) {
      try {
        await this.pgClient.end();
      } catch (error) {
        console.error('Error closing PostgreSQL connection:', error);
      }
      this.pgClient = null;
    }
    
    if (this.localServer) {
      try {
        this.localServer.close();
      } catch (error) {
        console.error('Error closing local server:', error);
      }
      this.localServer = null;
    }
    
    if (this.sshClient) {
      try {
        this.sshClient.end();
      } catch (error) {
        console.error('Error closing SSH connection:', error);
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
}

export const dbConnection = new DatabaseConnection();
export const getDb = () => dbConnection.getDb();