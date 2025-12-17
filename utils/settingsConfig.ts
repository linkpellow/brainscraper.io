/**
 * Settings Configuration Management
 * 
 * Centralized settings storage using file-based pattern
 * Compatible with Railway persistent volumes
 * Uses file locking to prevent concurrent write issues
 */

import { getDataDirectory, ensureDataDirectory, safeWriteFile, safeReadFile } from './dataDirectory';
import { withLock } from './fileLock';
import { API_REGISTRY } from './apiRegistry';

export interface ScrapeLimits {
  linkedin: { daily: number; monthly: number };
  facebook: { daily: number; monthly: number };
}

export interface CooldownWindows {
  enabled: boolean;
  errorThreshold: number; // errors per minute
  pauseDuration: number; // seconds
}

export interface RetryLogic {
  maxRetries: number;
  backoffStrategy: 'exponential' | 'linear' | 'fixed';
}

export interface ScrapeProfile {
  id: string;
  name: string;
  platform: 'linkedin' | 'facebook';
  filters: {
    // LinkedIn
    jobTitle?: string;
    location?: string;
    companySize?: string;
    isSelfEmployed?: boolean;
    changedJobs?: boolean;
    // Facebook
    groupId?: string;
    keywords?: string[];
  };
  schedule?: {
    enabled: boolean;
    cronExpression: string;
    timezone: string;
  };
  enrichmentRules?: {
    skipAPIs?: string[]; // Which APIs to skip for this profile
  };
}

export interface APIToggle {
  enabled: boolean;
  costPer1000: number;
  dependencies?: string[]; // APIs that depend on this
}

export interface ConditionalRule {
  id: string;
  name: string;
  condition: string; // e.g., "linkedin-completed"
  action: 'wait' | 'skip' | 'pause';
}

export interface Scheduling {
  businessHoursOnly: boolean;
  avoidWeekends: boolean;
  timezone: string;
  loadBalancing: boolean;
  conditionalRules: ConditionalRule[];
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface Output {
  defaultDestination: 'csv' | 'webhook' | 'crm' | 'dashboard';
  webhookUrl?: string;
  webhookRetryRules: RetryConfig;
  fieldMapping?: Record<string, string>;
}

export interface Notifications {
  scrapeStarted: boolean;
  scrapeCompleted: boolean;
  errorsDetected: boolean;
  quotaApproaching: boolean;
  jobAutoPaused: boolean;
  channels: ('email' | 'webhook')[];
}

export interface SettingsConfig {
  scrapeLimits: ScrapeLimits;
  rateThrottle: 'safe' | 'normal' | 'aggressive';
  cooldownWindows: CooldownWindows;
  retryLogic: RetryLogic;
  scrapeProfiles: ScrapeProfile[];
  apiToggles: Record<string, APIToggle>;
  scheduling: Scheduling;
  output: Output;
  notifications: Notifications;
}

/**
 * Default settings (backward compatible - all features disabled)
 */
export const DEFAULT_SETTINGS: SettingsConfig = {
  scrapeLimits: {
    linkedin: { daily: Infinity, monthly: Infinity },
    facebook: { daily: Infinity, monthly: Infinity },
  },
  rateThrottle: 'normal', // Existing behavior
  cooldownWindows: {
    enabled: false,
    errorThreshold: 10,
    pauseDuration: 300, // 5 minutes
  },
  retryLogic: {
    maxRetries: 3,
    backoffStrategy: 'exponential',
  },
  scrapeProfiles: [],
  apiToggles: {}, // Empty = all APIs enabled by default
  scheduling: {
    businessHoursOnly: false,
    avoidWeekends: false,
    timezone: 'UTC',
    loadBalancing: false,
    conditionalRules: [],
  },
  output: {
    defaultDestination: 'csv', // Existing behavior
    webhookRetryRules: {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
  },
  notifications: {
    scrapeStarted: true,
    scrapeCompleted: true,
    errorsDetected: true,
    quotaApproaching: true,
    jobAutoPaused: true,
    channels: [],
  },
};

const SETTINGS_FILE = 'settings.json';
let settingsCache: SettingsConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5000; // 5 seconds cache

/**
 * Get settings file path
 */
function getSettingsFilePath(): string {
  const dataDir = getDataDirectory();
  const path = require('path');
  return path.join(dataDir, SETTINGS_FILE);
}

/**
 * Load settings from disk
 * Returns default settings if file doesn't exist or is corrupted
 */
export function loadSettings(): SettingsConfig {
  // Check cache first
  const now = Date.now();
  if (settingsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return settingsCache;
  }

  try {
    const filePath = getSettingsFilePath();
    const content = safeReadFile(filePath);

    if (!content) {
      // File doesn't exist - return defaults
      console.log('[SETTINGS] Settings file not found, using defaults');
      settingsCache = { ...DEFAULT_SETTINGS };
      cacheTimestamp = now;
      return settingsCache;
    }

    // Parse JSON
    try {
      const parsed = JSON.parse(content) as Partial<SettingsConfig>;
      
      // Merge with defaults to ensure all fields exist
      const merged: SettingsConfig = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        scrapeLimits: {
          ...DEFAULT_SETTINGS.scrapeLimits,
          ...parsed.scrapeLimits,
          linkedin: {
            ...DEFAULT_SETTINGS.scrapeLimits.linkedin,
            ...parsed.scrapeLimits?.linkedin,
          },
          facebook: {
            ...DEFAULT_SETTINGS.scrapeLimits.facebook,
            ...parsed.scrapeLimits?.facebook,
          },
        },
        cooldownWindows: {
          ...DEFAULT_SETTINGS.cooldownWindows,
          ...parsed.cooldownWindows,
        },
        retryLogic: {
          ...DEFAULT_SETTINGS.retryLogic,
          ...parsed.retryLogic,
        },
        scheduling: {
          ...DEFAULT_SETTINGS.scheduling,
          ...parsed.scheduling,
          conditionalRules: parsed.scheduling?.conditionalRules || DEFAULT_SETTINGS.scheduling.conditionalRules,
        },
        output: {
          ...DEFAULT_SETTINGS.output,
          ...parsed.output,
        },
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          ...parsed.notifications,
        },
      };

      // CRITICAL: Ensure all locked APIs are enabled (cannot be disabled)
      if (!merged.apiToggles) {
        merged.apiToggles = {};
      }
      for (const [apiKey, metadata] of Object.entries(API_REGISTRY)) {
        if (metadata.locked) {
          merged.apiToggles[apiKey] = {
            enabled: true, // Locked APIs are always enabled
            costPer1000: metadata.costPer1000,
            dependencies: metadata.dependencies,
          };
        }
      }

      settingsCache = merged;
      cacheTimestamp = now;
      return merged;
    } catch (parseError) {
      console.error('[SETTINGS] Failed to parse settings file:', parseError);
      // Return defaults on parse error
      settingsCache = { ...DEFAULT_SETTINGS };
      cacheTimestamp = now;
      return settingsCache;
    }
  } catch (error) {
    console.error('[SETTINGS] Failed to load settings:', error);
    // Return defaults on any error
    settingsCache = { ...DEFAULT_SETTINGS };
    cacheTimestamp = now;
    return settingsCache;
  }
}

/**
 * Load settings (async version)
 */
export async function loadSettingsAsync(): Promise<SettingsConfig> {
  return loadSettings();
}

/**
 * Save settings to disk with file locking
 */
export async function saveSettings(settings: SettingsConfig): Promise<void> {
  try {
    ensureDataDirectory();
    const filePath = getSettingsFilePath();

    // Validate settings structure
    const validated: SettingsConfig = {
      ...DEFAULT_SETTINGS,
      ...settings,
    };

    // CRITICAL: Ensure all locked APIs are enabled (cannot be disabled)
    if (!validated.apiToggles) {
      validated.apiToggles = {};
    }
    for (const [apiKey, metadata] of Object.entries(API_REGISTRY)) {
      if (metadata.locked) {
        validated.apiToggles[apiKey] = {
          enabled: true, // Locked APIs are always enabled
          costPer1000: metadata.costPer1000,
          dependencies: metadata.dependencies,
        };
      }
    }

    // Use file locking for concurrent safety
    await withLock(filePath, async () => {
      safeWriteFile(filePath, JSON.stringify(validated, null, 2));
    });

    // Invalidate cache
    settingsCache = null;
    cacheTimestamp = 0;

    console.log('[SETTINGS] Settings saved successfully');
  } catch (error) {
    console.error('[SETTINGS] Failed to save settings:', error);
    throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Invalidate settings cache (call after external changes)
 */
export function invalidateSettingsCache(): void {
  settingsCache = null;
  cacheTimestamp = 0;
}

/**
 * Validate settings structure
 */
export function validateSettings(settings: Partial<SettingsConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate scrape limits
  if (settings.scrapeLimits) {
    if (settings.scrapeLimits.linkedin) {
      if (typeof settings.scrapeLimits.linkedin.daily !== 'number' || settings.scrapeLimits.linkedin.daily < 0) {
        errors.push('LinkedIn daily limit must be a non-negative number');
      }
      if (typeof settings.scrapeLimits.linkedin.monthly !== 'number' || settings.scrapeLimits.linkedin.monthly < 0) {
        errors.push('LinkedIn monthly limit must be a non-negative number');
      }
    }
    if (settings.scrapeLimits.facebook) {
      if (typeof settings.scrapeLimits.facebook.daily !== 'number' || settings.scrapeLimits.facebook.daily < 0) {
        errors.push('Facebook daily limit must be a non-negative number');
      }
      if (typeof settings.scrapeLimits.facebook.monthly !== 'number' || settings.scrapeLimits.facebook.monthly < 0) {
        errors.push('Facebook monthly limit must be a non-negative number');
      }
    }
  }

  // Validate rate throttle
  if (settings.rateThrottle && !['safe', 'normal', 'aggressive'].includes(settings.rateThrottle)) {
    errors.push('Rate throttle must be one of: safe, normal, aggressive');
  }

  // Validate timezone
  if (settings.scheduling?.timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: settings.scheduling.timezone });
    } catch {
      errors.push('Invalid timezone');
    }
  }

  // Validate webhook URL if provided
  if (settings.output?.webhookUrl) {
    try {
      new URL(settings.output.webhookUrl);
    } catch {
      errors.push('Invalid webhook URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

