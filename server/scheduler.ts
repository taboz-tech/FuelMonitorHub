import { getDb } from './db';
import { sensorReadings, dailyClosingReadings, sites } from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export class DataCaptureScheduler {
  private isRunning = false;

  start() {
    // NO CRON JOB - Only manual trigger available
    this.isRunning = true;
    console.log('📋 Data capture scheduler initialized - manual trigger only (no cron)');
  }

  stop() {
    this.isRunning = false;
  }

  // Manual trigger for testing/admin use - calls the enhanced function
  async triggerManualCapture() {
    console.log('🔧 Manual daily capture triggered...');
    
    try {
      const db = getDb();
      
      // This will use the enhanced capture logic from the API endpoint
      const results = await this.captureDailyReadingsEnhanced();
      
      console.log('✅ Manual capture completed:', {
        total: results.totalDevices,
        successful: results.successfulCaptures,
        failed: results.failedCaptures,
        skipped: results.skippedCaptures
      });
      
      return results;
    } catch (error) {
      console.error('❌ Manual capture failed:', error);
      throw error;
    }
  }

  // Enhanced capture with fallback logic (same as API endpoint)
  private async captureDailyReadingsEnhanced() {
    const db = getDb();
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
        const captureResult = await this.captureReadingWithFallback(db, siteData, deviceId);
        
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

    console.log(`🎉 Enhanced daily closing capture completed:`, results);
    return results;
  }

  // Enhanced capture function with Python-like fallback logic
  private async captureReadingWithFallback(db: any, siteData: any, deviceId: string) {
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

      let captureResult = await this.findReadingInWindow(db, deviceId, closingStart, closingEnd, 'CLOSING_WINDOW');
      
      if (captureResult.readings.length > 0) {
        await this.saveClosingReading(db, siteData, deviceId, captureResult);
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
      
      captureResult = await this.findReadingInWindow(db, deviceId, dayStart, dayEnd, 'SAME_DAY');
      
      if (captureResult.readings.length > 0) {
        await this.saveClosingReading(db, siteData, deviceId, captureResult);
        return {
          deviceId,
          status: 'SUCCESS',
          method: 'SAME_DAY',
          capturedAt: captureResult.capturedAt,
          fuelLevel: captureResult.fuelLevel,
          success: true
        };
      }

      // Step 3: Try previous days (up to 3 days back)
      for (let daysBack = 1; daysBack <= 3; daysBack++) {
        const lookbackDate = new Date(today);
        lookbackDate.setDate(lookbackDate.getDate() - daysBack);
        
        const lookbackStart = new Date(lookbackDate);
        lookbackStart.setHours(0, 0, 0, 0);
        const lookbackEnd = new Date(lookbackDate);
        lookbackEnd.setHours(23, 59, 59, 999);

        captureResult = await this.findReadingInWindow(db, deviceId, lookbackStart, lookbackEnd, `PREVIOUS_DAY_${daysBack}`);
        
        if (captureResult.readings.length > 0) {
          await this.saveClosingReading(db, siteData, deviceId, captureResult);
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

      // Step 4: Get the very last available reading (no time limit)
      captureResult = await this.getLastAvailableReading(db, deviceId);
      
      if (captureResult.readings.length > 0) {
        await this.saveClosingReading(db, siteData, deviceId, captureResult);
        
        // Calculate how many days ago this reading was
        const readingDate = new Date(captureResult.capturedAt);
        const daysAgo = Math.floor((now.getTime() - readingDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          deviceId,
          status: 'SUCCESS',
          method: 'LAST_AVAILABLE',
          capturedAt: captureResult.capturedAt,
          fuelLevel: captureResult.fuelLevel,
          daysOld: daysAgo,
          warning: `Used reading from ${daysAgo} days ago`,
          success: true
        };
      }

      // Step 5: No readings found anywhere
      return {
        deviceId,
        status: 'NO_READINGS',
        reason: 'No readings found in database for this device',
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

  // Helper function to find readings in a specific time window
  private async findReadingInWindow(db: any, deviceId: string, startTime: Date, endTime: Date, method: string) {
    console.log(`🔍 Looking for ${method} readings for ${deviceId} between ${startTime.toISOString()} and ${endTime.toISOString()}`);

    // Get the latest readings for each sensor type in the time window
    const sensorReadings = await db.execute(sql`
      SELECT DISTINCT ON (device_id, sensor_name) 
        time, device_id, sensor_name, value, unit 
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND time >= ${startTime.toISOString()}
        AND time <= ${endTime.toISOString()}
        AND sensor_name IN ('fuel_sensor_level', 'fuel_sensor_volume', 'fuel_sensor_temp', 'fuel_sensor_temperature', 'generator_state', 'zesa_state')
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
      if (row.sensor_name.startsWith('fuel_sensor_')) {
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

    // Use the original timestamp from the fuel level sensor if available
    const capturedAt = fuelLevelRow ? new Date(fuelLevelRow.time) : latestFuelTime;

    return {
      readings: sensorReadings.rows,
      method,
      capturedAt,
      fuelLevel: fuelLevelRow ? parseFloat(fuelLevelRow.value) : null,
      fuelVolume: fuelVolumeRow ? parseFloat(fuelVolumeRow.value) : null,
      temperature: tempRow ? parseFloat(tempRow.value) : null,
      generatorState: generatorRow ? generatorRow.value.toString() : null,
      zesaState: zesaRow ? zesaRow.value.toString() : null
    };
  }

  // Helper function to get the very last available reading
  private async getLastAvailableReading(db: any, deviceId: string) {
    console.log(`🔍 Getting LAST AVAILABLE reading for ${deviceId} (no time limit)`);

    const lastReadings = await db.execute(sql`
      SELECT DISTINCT ON (sensor_name) 
        time, device_id, sensor_name, value, unit 
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name IN ('fuel_sensor_level', 'fuel_sensor_volume', 'fuel_sensor_temp', 'fuel_sensor_temperature', 'generator_state', 'zesa_state')
      ORDER BY sensor_name, time DESC
    `);

    if (lastReadings.rows.length === 0) {
      return { readings: [], method: 'LAST_AVAILABLE' };
    }

    console.log(`📊 Found ${lastReadings.rows.length} last available readings for ${deviceId}`);

    // Convert to map and find latest fuel sensor timestamp
    const sensorMap = new Map();
    let latestFuelTime = new Date(0);

    for (const row of lastReadings.rows) {
      sensorMap.set(row.sensor_name, row);
      
      if (row.sensor_name.startsWith('fuel_sensor_')) {
        const readingTime = new Date(row.time);
        if (readingTime > latestFuelTime) {
          latestFuelTime = readingTime;
        }
      }
    }

    const fuelLevelRow = sensorMap.get('fuel_sensor_level');
    const fuelVolumeRow = sensorMap.get('fuel_sensor_volume');
    const tempRow = sensorMap.get('fuel_sensor_temp') || sensorMap.get('fuel_sensor_temperature');
    const generatorRow = sensorMap.get('generator_state');
    const zesaRow = sensorMap.get('zesa_state');

    // Use the actual timestamp from the fuel level reading
    const capturedAt = fuelLevelRow ? new Date(fuelLevelRow.time) : latestFuelTime;

    return {
      readings: lastReadings.rows,
      method: 'LAST_AVAILABLE',
      capturedAt,
      fuelLevel: fuelLevelRow ? parseFloat(fuelLevelRow.value) : null,
      fuelVolume: fuelVolumeRow ? parseFloat(fuelVolumeRow.value) : null,
      temperature: tempRow ? parseFloat(tempRow.value) : null,
      generatorState: generatorRow ? generatorRow.value.toString() : null,
      zesaState: zesaRow ? zesaRow.value.toString() : null
    };
  }

  // Helper function to save the closing reading
  private async saveClosingReading(db: any, siteData: any, deviceId: string, captureResult: any) {
    // Use the original timestamp from the sensor reading
    const originalTimestamp = captureResult.capturedAt;

    const insertData = {
      siteId: siteData.id,
      deviceId: deviceId,
      fuelLevel: captureResult.fuelLevel ? captureResult.fuelLevel.toFixed(2) : null,
      fuelVolume: captureResult.fuelVolume ? captureResult.fuelVolume.toFixed(2) : null,
      temperature: captureResult.temperature ? captureResult.temperature.toFixed(2) : null,
      generatorState: captureResult.generatorState || 'unknown',
      zesaState: captureResult.zesaState || 'unknown',
      capturedAt: originalTimestamp, // CRITICAL: Use original sensor timestamp, not current time
    };

    await db.insert(dailyClosingReadings).values(insertData);

    console.log(`✅ Daily reading saved for ${siteData.name}:`, {
      fuel: insertData.fuelLevel ? `${insertData.fuelLevel}%` : 'N/A',
      volume: insertData.fuelVolume ? `${insertData.fuelVolume}L` : 'N/A',
      temp: insertData.temperature ? `${insertData.temperature}°C` : 'N/A',
      generator: insertData.generatorState,
      zesa: insertData.zesaState,
      originalTimestamp: originalTimestamp.toISOString(),
      method: captureResult.method
    });
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

      const totalSites = await db.execute(sql`
        SELECT COUNT(DISTINCT device_id) as count FROM sensor_readings
      `);

      return {
        capturedToday: todayReadings.length,
        totalSites: totalSites.rows[0]?.count || 0,
        nextCapture: 'Manual trigger only (no automatic schedule)',
        lastReading: todayReadings.length > 0 ? todayReadings[0].capturedAt : null
      };
    } catch (error) {
      console.error('Error getting daily readings summary:', error);
      return null;
    }
  }
}

export const scheduler = new DataCaptureScheduler();