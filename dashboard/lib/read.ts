import { getLatestChanges, getChangesForVendor, getStats, getWatches, getCollectorHealth, getHeals } from "./db";

export function readLatestChanges(limit = 50) {
  try {
    return getLatestChanges(limit);
  } catch {
    return [];
  }
}

export function readVendorChanges(vendor: string, limit = 200) {
  try {
    return getChangesForVendor(vendor, limit);
  } catch {
    return [];
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function readStats() {
  try {
    return getStats();
  } catch {
    return {
      total_changes: 0,
      total_breaking: 0,
      vendors_active: 0,
      by_vendor: [] as any[],
      this_week_count: 0,
      last_week_count: 0,
    };
  }
}

export function readWatches() {
  try {
    return getWatches();
  } catch {
    return [];
  }
}

export function readCollectorHealth() {
  try {
    return getCollectorHealth();
  } catch (err) {
    console.warn("[modelpulse] collector health unavailable:", err);
    return [];
  }
}

export function readHeals(limit = 25) {
  try {
    return getHeals(limit);
  } catch (err) {
    console.warn("[modelpulse] heal history unavailable:", err);
    return [];
  }
}
