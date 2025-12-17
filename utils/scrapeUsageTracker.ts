/**
 * Scrape Usage Tracker
 * 
 * Tracks daily and monthly scrape counts per platform
 * Used for enforcing scrape limits
 */

import { getDataDirectory, ensureDataDirectory, safeWriteFile, safeReadFile } from './dataDirectory';
import { withLock } from './fileLock';

export interface DailyUsage {
  count: number;
  jobs: string[];
}

export interface MonthlyUsage {
  [month: string]: number; // e.g., "2025-01": 1500
}

export interface PlatformUsage {
  [date: string]: DailyUsage | MonthlyUsage; // e.g., "2025-01-15": { count: 150, jobs: [...] }
  monthly: MonthlyUsage;
}

export interface ScrapeUsage {
  linkedin: PlatformUsage;
  facebook: PlatformUsage;
}

const USAGE_FILE = 'scrape-usage.json';

/**
 * Get usage file path
 */
function getUsageFilePath(): string {
  if (typeof window !== 'undefined') {
    return './data/scrape-usage.json'; // Placeholder for client
  }
  const dataDir = getDataDirectory();
  const path = require('path');
  return path.join(dataDir, USAGE_FILE);
}

/**
 * Load usage data from disk
 */
function loadUsageData(): ScrapeUsage {
  try {
    const filePath = getUsageFilePath();
    const content = safeReadFile(filePath);

    if (!content) {
      // File doesn't exist - return empty structure
      return {
        linkedin: { monthly: {} },
        facebook: { monthly: {} },
      };
    }

    try {
      const parsed = JSON.parse(content) as Partial<ScrapeUsage>;
      
      return {
        linkedin: {
          ...parsed.linkedin,
          monthly: parsed.linkedin?.monthly || {},
        } as PlatformUsage,
        facebook: {
          ...parsed.facebook,
          monthly: parsed.facebook?.monthly || {},
        } as PlatformUsage,
      };
    } catch (parseError) {
      console.error('[USAGE_TRACKER] Failed to parse usage file:', parseError);
      return {
        linkedin: { monthly: {} },
        facebook: { monthly: {} },
      };
    }
  } catch (error) {
    console.error('[USAGE_TRACKER] Failed to load usage data:', error);
    return {
      linkedin: { monthly: {} },
      facebook: { monthly: {} },
    };
  }
}

/**
 * Save usage data to disk with file locking
 */
async function saveUsageData(usage: ScrapeUsage): Promise<void> {
  try {
    ensureDataDirectory();
    const filePath = getUsageFilePath();

    await withLock(filePath, async () => {
      safeWriteFile(filePath, JSON.stringify(usage, null, 2));
    });
  } catch (error) {
    console.error('[USAGE_TRACKER] Failed to save usage data:', error);
    throw error;
  }
}

/**
 * Get current date string (YYYY-MM-DD)
 */
function getCurrentDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Get current month string (YYYY-MM)
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get daily usage count for a platform
 */
export async function getDailyUsage(platform: 'linkedin' | 'facebook'): Promise<number> {
  const usage = loadUsageData();
  const date = getCurrentDate();
  return usage[platform][date]?.count || 0;
}

/**
 * Get monthly usage count for a platform
 */
export async function getMonthlyUsage(platform: 'linkedin' | 'facebook'): Promise<number> {
  const usage = loadUsageData();
  const month = getCurrentMonth();
  return usage[platform].monthly[month] || 0;
}

/**
 * Check if scrape limit is reached
 */
export interface LimitCheckResult {
  allowed: boolean;
  limitType?: 'daily' | 'monthly';
  currentCount: number;
  limit: number;
  dailyLimit: number;
  monthlyLimit: number;
}

export async function checkScrapeLimit(
  platform: 'linkedin' | 'facebook',
  dailyLimit: number,
  monthlyLimit: number
): Promise<LimitCheckResult> {
  const dailyCount = await getDailyUsage(platform);
  const monthlyCount = await getMonthlyUsage(platform);

  // Check monthly limit first (more restrictive)
  if (monthlyLimit !== Infinity && monthlyCount >= monthlyLimit) {
    return {
      allowed: false,
      limitType: 'monthly',
      currentCount: monthlyCount,
      limit: monthlyLimit,
      dailyLimit,
      monthlyLimit,
    };
  }

  // Check daily limit
  if (dailyLimit !== Infinity && dailyCount >= dailyLimit) {
    return {
      allowed: false,
      limitType: 'daily',
      currentCount: dailyCount,
      limit: dailyLimit,
      dailyLimit,
      monthlyLimit,
    };
  }

  return {
    allowed: true,
    currentCount: dailyCount,
    limit: dailyLimit,
    dailyLimit,
    monthlyLimit,
  };
}

/**
 * Increment scrape count for a platform
 */
export async function incrementScrapeCount(
  platform: 'linkedin' | 'facebook',
  count: number,
  jobId?: string
): Promise<void> {
  const usage = loadUsageData();
  const date = getCurrentDate();
  const month = getCurrentMonth();

  // Initialize if needed
  if (!usage[platform][date]) {
    usage[platform][date] = { count: 0, jobs: [] };
  }
  if (!usage[platform].monthly[month]) {
    usage[platform].monthly[month] = 0;
  }

  // Increment counts
  const dailyUsage = usage[platform][date] as DailyUsage;
  dailyUsage.count += count;
  usage[platform].monthly[month] = (usage[platform].monthly[month] || 0) + count;

  // Add job ID if provided
  if (jobId && !dailyUsage.jobs.includes(jobId)) {
    dailyUsage.jobs.push(jobId);
  }

  // Cleanup old daily records (keep last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

  for (const dateKey of Object.keys(usage[platform])) {
    if (dateKey !== 'monthly' && dateKey < cutoffDate) {
      delete usage[platform][dateKey];
    }
  }

  await saveUsageData(usage);
}

/**
 * Get usage statistics
 */
export interface UsageStats {
  linkedin: {
    daily: number;
    monthly: number;
    dailyLimit: number;
    monthlyLimit: number;
  };
  facebook: {
    daily: number;
    monthly: number;
    dailyLimit: number;
    monthlyLimit: number;
  };
}

export async function getUsageStats(dailyLimits: { linkedin: number; facebook: number }, monthlyLimits: { linkedin: number; facebook: number }): Promise<UsageStats> {
  const linkedinDaily = await getDailyUsage('linkedin');
  const linkedinMonthly = await getMonthlyUsage('linkedin');
  const facebookDaily = await getDailyUsage('facebook');
  const facebookMonthly = await getMonthlyUsage('facebook');

  return {
    linkedin: {
      daily: linkedinDaily,
      monthly: linkedinMonthly,
      dailyLimit: dailyLimits.linkedin,
      monthlyLimit: monthlyLimits.linkedin,
    },
    facebook: {
      daily: facebookDaily,
      monthly: facebookMonthly,
      dailyLimit: dailyLimits.facebook,
      monthlyLimit: monthlyLimits.facebook,
    },
  };
}

