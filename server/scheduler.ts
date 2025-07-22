import cron from 'node-cron';
import { getDb } from './db';
import { sensorReadings, dailyClosingReadings, sites } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

export class DataCaptureScheduler {
  private isRunning = false;

  start() {
    if (this.isRunning) return;

    // Schedule daily capture at 23:55 (11:55 PM)
    cron.schedule('55 23 * * *', async () => {
      await this.captureDailyReadings();
    }, {
      timezone: 'Africa/Harare'
    });

    this.isRunning = true;
    console.log('Data capture scheduler started - daily readings at 23:55');
  }

  stop() {
    this.isRunning = false;
  }

  async captureDailyReadings() {
    try {
      const db = getDb();
      console.log('Starting daily reading capture...');

      // Get all active sites
      const activeSites = await db
        .select()
        .from(sites)
        .where(eq(sites.isActive, true));

      for (const site of activeSites) {
        await this.captureSiteReading(site);
      }

      console.log(`Daily readings captured for ${activeSites.length} sites`);
    } catch (error) {
      console.error('Error capturing daily readings:', error);
    }
  }

  private async captureSiteReading(site: any) {
    try {
      const db = getDb();
      const now = new Date();

      // Get latest sensor readings for this device
      const latestReadings = await db
        .select()
        .from(sensorReadings)
        .where(eq(sensorReadings.deviceId, site.deviceId))
        .orderBy(desc(sensorReadings.time))
        .limit(10);

      if (latestReadings.length === 0) {
        console.log(`No sensor readings found for device ${site.deviceId}`);
        return;
      }

      // Extract relevant readings
      const fuelLevelReading = latestReadings.find(r => 
        r.sensorName === 'fuel_sensor_level'
      );
      
      const fuelVolumeReading = latestReadings.find(r => 
        r.sensorName === 'fuel_sensor_volume'
      );
      
      const temperatureReading = latestReadings.find(r => 
        r.sensorName === 'fuel_sensor_temperature' || 
        r.sensorName === 'fuel_sensor_temp'
      );
      
      const generatorReading = latestReadings.find(r => 
        r.sensorName === 'generator_state'
      );
      
      const zesaReading = latestReadings.find(r => 
        r.sensorName === 'zesa_state'
      );

      // Insert daily closing reading
      await db.insert(dailyClosingReadings).values({
        siteId: site.id,
        deviceId: site.deviceId,
        fuelLevel: fuelLevelReading?.value?.toString() || null,
        fuelVolume: fuelVolumeReading?.value?.toString() || null,
        temperature: temperatureReading?.value?.toString() || null,
        generatorState: generatorReading?.value?.toString() || 'unknown',
        zesaState: zesaReading?.value?.toString() || 'unknown',
        capturedAt: now,
      });

      console.log(`Daily reading captured for site ${site.name}`);
    } catch (error) {
      console.error(`Error capturing reading for site ${site.name}:`, error);
    }
  }

  // Manual trigger for testing
  async triggerManualCapture() {
    await this.captureDailyReadings();
  }
}

export const scheduler = new DataCaptureScheduler();
