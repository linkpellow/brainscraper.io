/**
 * Settings API Route
 * 
 * GET /api/settings - Load current settings
 * PUT /api/settings - Update settings (with validation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings, validateSettings, DEFAULT_SETTINGS, type SettingsConfig } from '@/utils/settingsConfig';
import { API_REGISTRY, getAllAPIKeys } from '@/utils/apiRegistry';

/**
 * GET /api/settings
 * Load current settings
 */
export async function GET() {
  try {
    const settings = loadSettings();
    
    // Ensure API toggles are initialized with registry data
    const apiToggles: Record<string, { enabled: boolean; costPer1000: number; dependencies?: string[] }> = {};
    
    // Initialize with registry data if not in settings
    // Default enabled state based on actual usage in enrichment pipeline
    const ACTIVE_APIS = new Set([
      'skip-tracing',      // ✅ Used in enrichRow() - STEP 3, STEP 6
      'telnyx-lookup',     // ✅ Used in enrichRow() - STEP 4
      'linkedin-scraper',  // ✅ Used for scraping
      'facebook-scraper',  // ✅ Used for scraping
      'dnc-scrub',         // ✅ Locked, always enabled
    ]);
    
    for (const apiKey of getAllAPIKeys()) {
      const metadata = API_REGISTRY[apiKey];
      if (settings.apiToggles[apiKey]) {
        apiToggles[apiKey] = settings.apiToggles[apiKey];
      } else {
        // Default: enabled only if actually used in pipeline OR locked
        const shouldBeEnabled = metadata.locked === true || ACTIVE_APIS.has(apiKey);
        apiToggles[apiKey] = {
          enabled: shouldBeEnabled,
          costPer1000: metadata.costPer1000,
          dependencies: metadata.dependencies,
        };
      }
    }

    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        apiToggles,
      },
    });
  } catch (error) {
    console.error('[SETTINGS_API] Failed to load settings:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Update settings (with validation)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const partialSettings = body.settings as Partial<SettingsConfig>;

    if (!partialSettings) {
      return NextResponse.json(
        {
          success: false,
          error: 'Settings object is required',
        },
        { status: 400 }
      );
    }

    // Validate settings
    const validation = validateSettings(partialSettings);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Settings validation failed',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    // Load current settings
    const currentSettings = loadSettings();

    // Merge with current settings
    const updatedSettings: SettingsConfig = {
      ...currentSettings,
      ...partialSettings,
      scrapeLimits: {
        ...currentSettings.scrapeLimits,
        ...partialSettings.scrapeLimits,
        linkedin: {
          ...currentSettings.scrapeLimits.linkedin,
          ...partialSettings.scrapeLimits?.linkedin,
        },
        facebook: {
          ...currentSettings.scrapeLimits.facebook,
          ...partialSettings.scrapeLimits?.facebook,
        },
      },
      cooldownWindows: {
        ...currentSettings.cooldownWindows,
        ...partialSettings.cooldownWindows,
      },
      retryLogic: {
        ...currentSettings.retryLogic,
        ...partialSettings.retryLogic,
      },
      scheduling: {
        ...currentSettings.scheduling,
        ...partialSettings.scheduling,
        conditionalRules: partialSettings.scheduling?.conditionalRules ?? currentSettings.scheduling.conditionalRules,
      },
      output: {
        ...currentSettings.output,
        ...partialSettings.output,
      },
      notifications: {
        ...currentSettings.notifications,
        ...partialSettings.notifications,
        channels: partialSettings.notifications?.channels ?? currentSettings.notifications.channels,
      },
      scrapeProfiles: partialSettings.scrapeProfiles ?? currentSettings.scrapeProfiles,
    };

    // Ensure API toggles have correct structure
    if (partialSettings.apiToggles) {
      for (const [apiKey, toggle] of Object.entries(partialSettings.apiToggles)) {
        const metadata = API_REGISTRY[apiKey];
        if (metadata) {
          updatedSettings.apiToggles[apiKey] = {
            enabled: metadata.locked ? true : (toggle.enabled ?? true), // Locked APIs always enabled
            costPer1000: metadata.costPer1000,
            dependencies: metadata.dependencies,
          };
        }
      }
    }

    // Save settings
    await saveSettings(updatedSettings);

    // Invalidate API config cache
    try {
      const { invalidateAPIConfigCache } = await import('@/utils/apiToggleMiddleware');
      invalidateAPIConfigCache();
    } catch (cacheError) {
      console.warn('[SETTINGS_API] Failed to invalidate cache:', cacheError);
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
      settings: updatedSettings,
    });
  } catch (error) {
    console.error('[SETTINGS_API] Failed to save settings:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

