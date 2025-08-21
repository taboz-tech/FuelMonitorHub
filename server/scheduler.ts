import cron from 'node-cron';
import { getDb } from './db';
import { sensorReadings, dailyClosingReadings, sites } from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

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
      console.log('🔄 Starting daily reading capture...');

      // Get all distinct device IDs from sensor_readings table
      const distinctDevices = await db
        .selectDistinct({ deviceId: sensorReadings.deviceId })
        .from(sensorReadings);

      console.log(`📊 Found ${distinctDevices.length} distinct devices in sensor_readings`);

      let captureCount = 0;
      for (const device of distinctDevices) {
        // Get or create site for this device
        let site = await db
          .select()
          .from(sites)
          .where(eq(sites.deviceId, device.deviceId))
          .limit(1);

        if (site.length === 0) {
          // Create site if it doesn't exist
          const newSiteResult = await db
            .insert(sites)
            .values({
              name: device.deviceId.replace('simbisa-', '').toUpperCase() + ' Site',
              location: device.deviceId.replace('simbisa-', '').toUpperCase() + ' Location',
              deviceId: device.deviceId,
              fuelCapacity: '2000.00',
              lowFuelThreshold: '25.00',
              isActive: true,
            })
            .returning();

          site = newSiteResult;
          console.log(`✅ Created new site for device: ${device.deviceId}`);
        }

        // Capture readings for this site
        const captured = await this.captureSiteReading(site[0]);
        if (captured) captureCount++;
      }

      console.log(`🎉 Daily readings captured successfully for ${captureCount}/${distinctDevices.length} sites`);
    } catch (error) {
      console.error('❌ Error capturing daily readings:', error);
    }
  }

  private async captureSiteReading(site: any): Promise<boolean> {
    try {
      const db = getDb();
      const now = new Date();
      const captureTime = new Date(now);
      captureTime.setHours(23, 55, 0, 0);

      console.log(`🔍 Capturing reading for site: ${site.name} (${site.deviceId})`);

      // Check if we already have a reading for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existingReading = await db
        .select()
        .from(dailyClosingReadings)
        .where(
          and(
            eq(dailyClosingReadings.siteId, site.id),
            sql`${dailyClosingReadings.capturedAt} >= ${today}`,
            sql`${dailyClosingReadings.capturedAt} < ${tomorrow}`
          )
        )
        .limit(1);

      if (existingReading.length > 0) {
        console.log(`⏭️ Daily reading already exists for ${site.name} today, skipping...`);
        return false;
      }

      // Get the latest sensor readings for this device (last 10 readings to be safe)
      const latestReadings = await db
        .select()
        .from(sensorReadings)
        .where(eq(sensorReadings.deviceId, site.deviceId))
        .orderBy(desc(sensorReadings.time))
        .limit(20); // Get more readings to ensure we have all sensor types

      if (latestReadings.length === 0) {
        console.log(`⚠️ No sensor readings found for device ${site.deviceId}`);
        return false;
      }

      console.log(`📈 Found ${latestReadings.length} recent sensor readings for ${site.deviceId}`);

      // Extract the latest reading for each sensor type
      const sensorMap = new Map();
      for (const reading of latestReadings) {
        if (!sensorMap.has(reading.sensorName)) {
          sensorMap.set(reading.sensorName, reading);
        }
      }

      // Extract relevant sensor values with fallbacks
      const fuelLevelReading = sensorMap.get('fuel_sensor_level');
      const fuelVolumeReading = sensorMap.get('fuel_sensor_volume');
      const tempReading = sensorMap.get('fuel_sensor_temp') || sensorMap.get('fuel_sensor_temperature');
      const generatorReading = sensorMap.get('generator_state');
      const zesaReading = sensorMap.get('zesa_state');

      // Prepare values with proper null handling
      const fuelLevel = fuelLevelReading ? parseFloat(fuelLevelReading.value.toString()) : null;
      const fuelVolume = fuelVolumeReading ? parseFloat(fuelVolumeReading.value.toString()) : null;
      const temperature = tempReading ? parseFloat(tempReading.value.toString()) : null;
      const generatorState = generatorReading ? generatorReading.value.toString() : 'unknown';
      const zesaState = zesaReading ? zesaReading.value.toString() : 'unknown';

      // Insert daily closing reading
      await db.insert(dailyClosingReadings).values({
        siteId: site.id,
        deviceId: site.deviceId,
        fuelLevel: fuelLevel?.toFixed(2) || null,
        fuelVolume: fuelVolume?.toFixed(2) || null,
        temperature: temperature?.toFixed(2) || null,
        generatorState: generatorState,
        zesaState: zesaState,
        capturedAt: captureTime,
      });

      console.log(`✅ Daily reading captured for ${site.name}:`, {
        fuel: fuelLevel ? `${fuelLevel.toFixed(1)}%` : 'N/A',
        volume: fuelVolume ? `${fuelVolume.toFixed(0)}L` : 'N/A',
        temp: temperature ? `${temperature.toFixed(1)}°C` : 'N/A',
        generator: generatorState,
        zesa: zesaState
      });

      return true;
    } catch (error) {
      console.error(`❌ Error capturing reading for site ${site.name}:`, error);
      return false;
    }
  }

  // Manual trigger for testing
  async triggerManualCapture() {
    console.log('🔧 Manual daily capture triggered...');
    await this.captureDailyReadings();
  }

  // Helper method to get current daily readings summary
  async getDailyReadingsSummary() {
    try {
      const db = getDb();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayReadings = await db
        .select()
        .from(dailyClosingReadings)
        .where(
          and(
            sql`${dailyClosingReadings.capturedAt} >= ${today}`,
            sql`${dailyClosingReadings.capturedAt} < ${tomorrow}`
          )
        );

      const totalSites = await db
        .selectDistinct({ deviceId: sensorReadings.deviceId })
        .from(sensorReadings);

      return {
        capturedToday: todayReadings.length,
        totalSites: totalSites.length,
        nextCapture: '23:55 today',
        lastReading: todayReadings.length > 0 ? todayReadings[0].capturedAt : null
      };
    } catch (error) {
      console.error('Error getting daily readings summary:', error);
      return null;
    }
  }
}

export const scheduler = new DataCaptureScheduler();