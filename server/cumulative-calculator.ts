import { sql } from 'drizzle-orm';

export class CumulativeCalculator {
  
  /**
   * Calculate fuel changes (consumption and top-ups) for a device on a specific date
   * Follows the Python preprocess_fuel_data logic
   */
  static async calculateFuelChanges(db: any, deviceId: string, targetDate: Date) {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get fuel level readings for the day
    const levelReadings = await db.execute(sql`
      SELECT time, value as fuel_level
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name = 'fuel_sensor_level'
        AND time >= ${startOfDay.toISOString()}
        AND time <= ${endOfDay.toISOString()}
        AND value IS NOT NULL
      ORDER BY time ASC
    `);

    // Get fuel volume readings for the day
    const volumeReadings = await db.execute(sql`
      SELECT time, value as fuel_volume
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name = 'fuel_sensor_volume'
        AND time >= ${startOfDay.toISOString()}
        AND time <= ${endOfDay.toISOString()}
        AND value IS NOT NULL
      ORDER BY time ASC
    `);

    if (levelReadings.rows.length < 2) {
      return {
        totalFuelConsumed: 0,
        totalFuelToppedup: 0,
        fuelConsumedPercent: 0,
        fuelToppedupPercent: 0
      };
    }

    // Create volume lookup map (following Python find_closest_volume logic)
    const volumeLookup = new Map();
    volumeReadings.rows.forEach((row: any) => {
      volumeLookup.set(new Date(row.time).getTime(), parseFloat(row.fuel_volume));
    });

    const findClosestVolume = (targetTime: Date, maxDiffMinutes = 5) => {
      const targetMs = targetTime.getTime();
      const maxDiffMs = maxDiffMinutes * 60 * 1000;

      if (volumeLookup.has(targetMs)) {
        return volumeLookup.get(targetMs);
      }

      let closestTime = null;
      let minDiff = maxDiffMs;

      for (const timeMs of volumeLookup.keys()) {
        const diff = Math.abs(timeMs - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          closestTime = timeMs;
        }
      }

      return closestTime ? volumeLookup.get(closestTime) : null;
    };

    // Calculate changes following Python logic
    let totalLevelIncrease = 0;
    let totalLevelDecrease = 0;
    let totalVolumeIncrease = 0;
    let totalVolumeDecrease = 0;

    for (let i = 1; i < levelReadings.rows.length; i++) {
      const prevReading = levelReadings.rows[i - 1];
      const currReading = levelReadings.rows[i];

      const prevLevel = parseFloat(prevReading.fuel_level);
      const currLevel = parseFloat(currReading.fuel_level);
      const levelChange = currLevel - prevLevel;

      const prevTime = new Date(prevReading.time);
      const currTime = new Date(currReading.time);

      if (levelChange > 0) {
        totalLevelIncrease += levelChange;
      } else {
        totalLevelDecrease += Math.abs(levelChange);
      }

      // Get corresponding volume readings
      const prevVolume = findClosestVolume(prevTime);
      const currVolume = findClosestVolume(currTime);

      if (prevVolume !== null && currVolume !== null) {
        const volumeChange = currVolume - prevVolume;
        
        if (volumeChange > 0 && levelChange > 0) {
          totalVolumeIncrease += volumeChange;
        } else if (volumeChange < 0 && levelChange < 0) {
          totalVolumeDecrease += Math.abs(volumeChange);
        }
      }
    }

    return {
      totalFuelConsumed: Math.round(totalVolumeDecrease * 10) / 10, // Round to 1 decimal
      totalFuelToppedup: Math.round(totalVolumeIncrease * 10) / 10,
      fuelConsumedPercent: Math.round(totalLevelDecrease * 100) / 100, // Round to 2 decimals
      fuelToppedupPercent: Math.round(totalLevelIncrease * 100) / 100
    };
  }

  /**
   * Calculate power runtimes for a device on a specific date
   * Follows the Python power_analyzer.py logic with proper current time handling
   */
  static async calculatePowerRuntimes(db: any, deviceId: string, targetDate: Date) {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Key fix: If processing today's data, only calculate up to current time
    // Otherwise calculate for the full day
    const isToday = startOfDay.getTime() === today.getTime();
    const endTime = isToday ? now : new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    
    const totalElapsedHours = (endTime.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);

    console.log(`Processing power for ${deviceId} on ${targetDate.toDateString()}, isToday: ${isToday}, elapsed: ${totalElapsedHours}h`);

    // Get generator state readings
    const generatorReadings = await db.execute(sql`
      SELECT time, value as state
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name = 'generator_state'
        AND time >= ${startOfDay.toISOString()}
        AND time <= ${endTime.toISOString()}
        AND value IS NOT NULL
      ORDER BY time ASC
    `);

    // Get ZESA state readings
    const zesaReadings = await db.execute(sql`
      SELECT time, value as state
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name = 'zesa_state'
        AND time >= ${startOfDay.toISOString()}
        AND time <= ${endTime.toISOString()}
        AND value IS NOT NULL
      ORDER BY time ASC
    `);

    // If no data, everything is offline
    if (generatorReadings.rows.length === 0 && zesaReadings.rows.length === 0) {
      return {
        totalGeneratorRuntime: 0,
        totalZesaRuntime: 0,
        totalOfflineTime: totalElapsedHours
      };
    }

    // Create unified timeline
    const timeline = [];
    
    generatorReadings.rows.forEach((row: any) => {
      timeline.push({
        time: new Date(row.time),
        source: 'generator',
        state: parseInt(row.state) || -1
      });
    });
    
    zesaReadings.rows.forEach((row: any) => {
      timeline.push({
        time: new Date(row.time),
        source: 'zesa',
        state: parseInt(row.state) || -1
      });
    });

    // Sort timeline by time
    timeline.sort((a, b) => a.time.getTime() - b.time.getTime());

    // Initialize states - look for readings before start of day to determine initial state
    let currentGenState = -1; // Default to offline
    let currentZesaState = -1; // Default to offline

    // Check for any readings before start of day to set initial state
    const preTimelineGen = await db.execute(sql`
      SELECT time, value as state
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name = 'generator_state'
        AND time < ${startOfDay.toISOString()}
        AND value IS NOT NULL
      ORDER BY time DESC
      LIMIT 1
    `);

    const preTimelineZesa = await db.execute(sql`
      SELECT time, value as state
      FROM sensor_readings 
      WHERE device_id = ${deviceId}
        AND sensor_name = 'zesa_state'
        AND time < ${startOfDay.toISOString()}
        AND value IS NOT NULL
      ORDER BY time DESC
      LIMIT 1
    `);

    if (preTimelineGen.rows.length > 0) {
      currentGenState = parseInt(preTimelineGen.rows[0].state) || -1;
    }
    if (preTimelineZesa.rows.length > 0) {
      currentZesaState = parseInt(preTimelineZesa.rows[0].state) || -1;
    }

    // Calculate runtimes
    let generatorRuntime = 0;
    let zesaRuntime = 0;
    let offlineTime = 0;
    let lastTime = startOfDay;

    // Process all timeline events and add end marker
    const allEvents = [...timeline, { time: endTime, source: 'end', state: 0 }];

    allEvents.forEach(event => {
      const duration = (event.time.getTime() - lastTime.getTime()) / (1000 * 60 * 60); // hours

      // Priority: generator > zesa > offline (following Python logic exactly)
      if (currentGenState === 1) {
        generatorRuntime += duration;
      } else if (currentZesaState === 1) {
        zesaRuntime += duration;
      } else {
        offlineTime += duration;
      }

      // Update current state (don't update for end marker)
      if (event.source === 'generator') {
        currentGenState = event.state;
      } else if (event.source === 'zesa') {
        currentZesaState = event.state;
      }

      lastTime = event.time;
    });

    // Round to 2 decimal places and ensure totals add up exactly
    generatorRuntime = Math.round(generatorRuntime * 100) / 100;
    zesaRuntime = Math.round(zesaRuntime * 100) / 100;
    offlineTime = Math.round(offlineTime * 100) / 100;

    const calculatedTotal = generatorRuntime + zesaRuntime + offlineTime;
    const totalElapsedRounded = Math.round(totalElapsedHours * 100) / 100;
    
    if (Math.abs(calculatedTotal - totalElapsedRounded) > 0.01) {
      // Adjust offline time to make total exactly right
      offlineTime = Math.round((totalElapsedRounded - generatorRuntime - zesaRuntime) * 100) / 100;
      offlineTime = Math.max(0, offlineTime);
    }

    console.log(`${deviceId}: Gen=${generatorRuntime}h, Zesa=${zesaRuntime}h, Offline=${offlineTime}h, Total=${generatorRuntime + zesaRuntime + offlineTime}h`);

    return {
      totalGeneratorRuntime: generatorRuntime,
      totalZesaRuntime: zesaRuntime,
      totalOfflineTime: offlineTime
    };
  }
}