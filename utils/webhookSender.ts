/**
 * Webhook Sender
 * 
 * Sends enriched leads to webhook URL with retry logic
 */

import { loadSettings } from './settingsConfig';
import type { RetryConfig } from './settingsConfig';

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = config;
  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Send a single lead to webhook
 */
async function sendLeadToWebhook(
  webhookUrl: string,
  lead: Record<string, unknown>,
  retryConfig: RetryConfig
): Promise<boolean> {
  try {
    await retryWithBackoff(
      async () => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(lead),
        });

        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
        }

        return true;
      },
      retryConfig
    );

    return true;
  } catch (error) {
    console.error('[WEBHOOK] Failed to send lead:', error);
    return false;
  }
}

/**
 * Send enriched leads to webhook URL
 */
export async function sendLeadsToWebhook(
  leads: Record<string, unknown>[],
  fieldMapping?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  try {
    const settings = loadSettings();
    const webhookUrl = settings.output.webhookUrl;

    if (!webhookUrl) {
      console.warn('[WEBHOOK] No webhook URL configured');
      return { sent: 0, failed: leads.length };
    }

    const retryConfig = settings.output.webhookRetryRules;
    let sent = 0;
    let failed = 0;

    // Map fields if mapping provided
    const mappedLeads = fieldMapping
      ? leads.map(lead => {
          const mapped: Record<string, unknown> = {};
          for (const [internalKey, externalKey] of Object.entries(fieldMapping)) {
            if (lead[internalKey] !== undefined) {
              mapped[externalKey] = lead[internalKey];
            }
          }
          return mapped;
        })
      : leads;

    // Send leads (can be batched or individual)
    for (const lead of mappedLeads) {
      const success = await sendLeadToWebhook(webhookUrl, lead, retryConfig);
      if (success) {
        sent++;
      } else {
        failed++;
      }
    }

    console.log(`[WEBHOOK] Sent ${sent}/${leads.length} leads to webhook`);
    return { sent, failed };
  } catch (error) {
    console.error('[WEBHOOK] Failed to send leads:', error);
    return { sent: 0, failed: leads.length };
  }
}

/**
 * Send batch of leads to webhook (more efficient)
 */
export async function sendBatchToWebhook(
  leads: Record<string, unknown>[],
  fieldMapping?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  try {
    const settings = loadSettings();
    const webhookUrl = settings.output.webhookUrl;

    if (!webhookUrl) {
      console.warn('[WEBHOOK] No webhook URL configured');
      return { sent: 0, failed: leads.length };
    }

    const retryConfig = settings.output.webhookRetryRules;

    // Map fields if mapping provided
    const mappedLeads = fieldMapping
      ? leads.map(lead => {
          const mapped: Record<string, unknown> = {};
          for (const [internalKey, externalKey] of Object.entries(fieldMapping)) {
            if (lead[internalKey] !== undefined) {
              mapped[externalKey] = lead[internalKey];
            }
          }
          return mapped;
        })
      : leads;

    // Send as batch
    const success = await retryWithBackoff(
      async () => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ leads: mappedLeads }),
        });

        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
        }

        return true;
      },
      retryConfig
    );

    if (success) {
      console.log(`[WEBHOOK] Sent batch of ${leads.length} leads to webhook`);
      return { sent: leads.length, failed: 0 };
    }

    return { sent: 0, failed: leads.length };
  } catch (error) {
    console.error('[WEBHOOK] Failed to send batch:', error);
    return { sent: 0, failed: leads.length };
  }
}

