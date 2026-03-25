/**
 * SignalController — Core signal state machine
 * Enhanced with 4-lane support, free left turn, and auto-emergency.
 *
 * Lane layout per arm (approaching the junction):
 *   Lane 0 = FREE LEFT (always green, vehicles turn left without signal)
 *   Lane 1 = STRAIGHT lane 1
 *   Lane 2 = STRAIGHT lane 2
 *   Lane 3 = RIGHT TURN lane
 *
 * Free left turn vehicles are subtracted from the signal load calculation
 * because they never wait at the signal.
 */

export const VEHICLE_WEIGHTS = {
  bike: 1,
  auto: 1.5,
  car: 2,
  bus: 4,
  ambulance: 0, // emergency — triggers override, not weighted
};

export const VEHICLE_COLORS = {
  bike: '#3b82f6',      // blue
  auto: '#eab308',      // yellow
  car: '#ef4444',       // red
  bus: '#22c55e',       // green
  ambulance: '#f97316', // orange with flashing
};

export const ARMS = ['N', 'E', 'S', 'W'];
export const ARM_LABELS = { N: 'North', E: 'East', S: 'South', W: 'West' };
export const LANE_NAMES = ['Free Left', 'Straight 1', 'Straight 2', 'Right Turn'];
export const NUM_LANES = 4;

const DEFAULT_BASE_GREEN = 30;
const FACTOR = 0.3;
const MIN_GREEN = 15;
const MAX_GREEN = 90;

// What fraction of vehicles will choose left turn (free left)
const FREE_LEFT_RATIO = 0.25;

/**
 * Calculate traffic load for a given arm's vehicle counts.
 * Subtracts free-left vehicles since they don't wait at signal.
 */
export function calculateLoad(vehicles) {
  const raw = (
    (vehicles.bike || 0) * VEHICLE_WEIGHTS.bike +
    (vehicles.auto || 0) * VEHICLE_WEIGHTS.auto +
    (vehicles.car || 0) * VEHICLE_WEIGHTS.car +
    (vehicles.bus || 0) * VEHICLE_WEIGHTS.bus
  );
  // Free-left vehicles reduce effective load
  const freeLeftReduction = raw * FREE_LEFT_RATIO;
  return Math.max(0, raw - freeLeftReduction);
}

/**
 * Calculate raw load without free-left deduction (for comparison).
 */
export function calculateRawLoad(vehicles) {
  return (
    (vehicles.bike || 0) * VEHICLE_WEIGHTS.bike +
    (vehicles.auto || 0) * VEHICLE_WEIGHTS.auto +
    (vehicles.car || 0) * VEHICLE_WEIGHTS.car +
    (vehicles.bus || 0) * VEHICLE_WEIGHTS.bus
  );
}

/**
 * Get the number of free-left vehicles for display.
 */
export function getFreeLeftCount(vehicles) {
  const total = (vehicles.bike || 0) + (vehicles.auto || 0) + (vehicles.car || 0) + (vehicles.bus || 0);
  return Math.round(total * FREE_LEFT_RATIO);
}

/**
 * Calculate adaptive green time for a given arm.
 */
export function calculateGreenTime(baseGreen, load, factor = FACTOR) {
  const raw = baseGreen + load * factor;
  return Math.max(MIN_GREEN, Math.min(MAX_GREEN, Math.round(raw)));
}

/**
 * Fixed-mode green time — always 30 seconds.
 */
export function fixedGreenTime() {
  return DEFAULT_BASE_GREEN;
}

/**
 * Calculate green times for all arms.
 */
export function calculateAllGreenTimes(armData, baseGreens, mode = 'ai') {
  const result = {};
  for (const arm of ARMS) {
    const load = calculateLoad(armData[arm] || {});
    if (mode === 'fixed') {
      result[arm] = fixedGreenTime();
    } else {
      const base = baseGreens[`arm_${arm}`] || DEFAULT_BASE_GREEN;
      result[arm] = calculateGreenTime(base, load);
    }
  }
  return result;
}

/**
 * Generate random vehicle counts for an arm (for demo purposes).
 * Now includes ambulance probability.
 */
export function generateRandomVehicles(intensity = 'medium') {
  const ranges = {
    low:    { bike: [0, 4],  auto: [0, 3],  car: [0, 4],  bus: [0, 1] },
    medium: { bike: [2, 10], auto: [1, 6],  car: [2, 10], bus: [0, 3] },
    high:   { bike: [5, 18], auto: [3, 10], car: [5, 18], bus: [1, 6] },
  };
  const r = ranges[intensity] || ranges.medium;
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  return {
    bike: rand(...r.bike),
    auto: rand(...r.auto),
    car: rand(...r.car),
    bus: rand(...r.bus),
    ambulance: 0, // managed separately by auto-emergency system
  };
}

/**
 * Assign a lane to a vehicle based on type and intended turn.
 *   Lane 0 = FREE LEFT (always flowing)
 *   Lane 1 = STRAIGHT lane 1
 *   Lane 2 = STRAIGHT lane 2
 *   Lane 3 = RIGHT TURN
 */
export function assignLane() {
  const r = Math.random();
  if (r < FREE_LEFT_RATIO) return 0;       // free left
  if (r < 0.50) return 1;                   // straight lane 1
  if (r < 0.80) return 2;                   // straight lane 2
  return 3;                                  // right turn
}
