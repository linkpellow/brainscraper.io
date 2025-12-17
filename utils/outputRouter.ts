/**
 * Output Router
 * 
 * Routes enriched leads to different destinations based on settings
 */

import { loadSettings } from './settingsConfig';
import { sendLeadsToWebhook, sendBatchToWebhook } from './webhookSender';

/**
 * Route enriched leads to configured destination
 */
export async function routeEnrichedLeads(
  leads: Record<string, unknown>[]
): Promise<{ destination: string; success: boolean; sent?: number; failed?: number }> {
  try {
    const settings = loadSettings();
    const destination = settings.output.defaultDestination;

    switch (destination) {
      case 'webhook':
        if (!settings.output.webhookUrl) {
          console.warn('[OUTPUT_ROUTER] Webhook URL not configured');
          return { destination: 'webhook', success: false };
        }

        // Use batch sending for efficiency
        const result = await sendBatchToWebhook(leads, settings.output.fieldMapping);
        return {
          destination: 'webhook',
          success: result.failed === 0,
          sent: result.sent,
          failed: result.failed,
        };

      case 'csv':
        // CSV export is handled by UI components (existing behavior)
        // This router just logs that CSV was selected
        console.log(`[OUTPUT_ROUTER] ${leads.length} leads routed to CSV export`);
        return { destination: 'csv', success: true };

      case 'dashboard':
        // Dashboard only - leads are already in the system
        console.log(`[OUTPUT_ROUTER] ${leads.length} leads available in dashboard`);
        return { destination: 'dashboard', success: true };

      case 'crm':
        // CRM integration - placeholder for future
        console.log(`[OUTPUT_ROUTER] CRM destination not yet implemented`);
        return { destination: 'crm', success: false };

      default:
        // Default to CSV
        console.log(`[OUTPUT_ROUTER] Unknown destination "${destination}", defaulting to CSV`);
        return { destination: 'csv', success: true };
    }
  } catch (error) {
    console.error('[OUTPUT_ROUTER] Failed to route leads:', error);
    return { destination: 'unknown', success: false };
  }
}

