import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from '@shared/schema';

class DatabaseConnection {
  private pgClient: Client | null = null;
  private db: ReturnType<typeof drizzle> | null = null;

  async connect() {
    if (this.db) return this.db;

    try {
      // Use the local PostgreSQL database created by Replit
      const dbConfig = {
        connectionString: process.env.DATABASE_URL,
      };

      // Create PostgreSQL client
      this.pgClient = new Client(dbConfig);
      await this.pgClient.connect();
      
      this.db = drizzle(this.pgClient, { schema });

      // Create tables if they don't exist
      await this.createTables();

      console.log('Database connected successfully');
      return this.db;
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
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
      VALUES ('admin', 'admin@fuelmonitor.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'System Administrator')
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
      await this.pgClient.end();
      this.pgClient = null;
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
