/**
 * Notifications System
 * 
 * Sends alerts based on events and settings
 */

import { loadSettings } from './settingsConfig';
import type { JobStatus } from './jobStatus';

/**
 * Send notification via configured channels
 */
async function sendNotification(
  event: string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const settings = loadSettings();
    const notifications = settings.notifications;

    // Check if this event type is enabled
    const eventEnabled = (() => {
      switch (event) {
        case 'scrape-started':
          return notifications.scrapeStarted;
        case 'scrape-completed':
          return notifications.scrapeCompleted;
        case 'errors-detected':
          return notifications.errorsDetected;
        case 'quota-approaching':
          return notifications.quotaApproaching;
        case 'job-auto-paused':
          return notifications.jobAutoPaused;
        default:
          return false;
      }
    })();

    if (!eventEnabled) {
      return; // Event type disabled
    }

    // Send via configured channels
    for (const channel of notifications.channels) {
      if (channel === 'webhook') {
        // Webhook notifications would go to a separate notification webhook
        // For now, we'll log it (can be extended later)
        console.log(`[NOTIFICATION] ${event}: ${message}`, data);
      } else if (channel === 'email') {
        // Email notifications - placeholder for future
        console.log(`[NOTIFICATION] Email: ${event}: ${message}`, data);
      }
    }

    // In-app notifications are handled by the frontend (polling job status)
    // This backend system just logs for now
  } catch (error) {
    console.error('[NOTIFICATIONS] Failed to send notification:', error);
  }
}

/**
 * Notify when scrape starts
 */
export async function notifyScrapeStarted(jobId: string, platform: 'linkedin' | 'facebook'): Promise<void> {
  await sendNotification('scrape-started', `Scraping started on ${platform}`, {
    jobId,
    platform,
  });
}

/**
 * Notify when scrape completes
 */
export async function notifyScrapeCompleted(
  jobId: string,
  platform: 'linkedin' | 'facebook',
  leadCount: number
): Promise<void> {
  await sendNotification('scrape-completed', `Scraping completed on ${platform}: ${leadCount} leads`, {
    jobId,
    platform,
    leadCount,
  });
}

/**
 * Notify when errors are detected
 */
export async function notifyErrorsDetected(
  jobId: string,
  errorCount: number,
  errors: string[]
): Promise<void> {
  await sendNotification('errors-detected', `${errorCount} errors detected in job ${jobId}`, {
    jobId,
    errorCount,
    errors: errors.slice(0, 5), // Limit to first 5 errors
  });
}

/**
 * Notify when quota is approaching limit
 */
export async function notifyQuotaApproaching(
  platform: 'linkedin' | 'facebook',
  current: number,
  limit: number,
  limitType: 'daily' | 'monthly'
): Promise<void> {
  const percentage = (current / limit) * 100;
  if (percentage >= 80) {
    await sendNotification('quota-approaching', `${platform} ${limitType} quota at ${percentage.toFixed(1)}%`, {
      platform,
      current,
      limit,
      limitType,
      percentage,
    });
  }
}

/**
 * Notify when job is auto-paused
 */
export async function notifyJobAutoPaused(reason: string): Promise<void> {
  await sendNotification('job-auto-paused', `Job auto-paused: ${reason}`, {
    reason,
  });
}

/**
 * Check job status and send notifications if needed
 */
export async function checkAndNotifyJobStatus(job: JobStatus): Promise<void> {
  try {
    const settings = loadSettings();

    // Check for errors
    if (job.status === 'failed' && settings.notifications.errorsDetected) {
      await notifyErrorsDetected(job.jobId, 1, [job.error || 'Unknown error']);
    }

    // Check for completion
    if (job.status === 'completed') {
      if (job.type === 'scraping' && settings.notifications.scrapeCompleted) {
        const platform = (job.metadata?.searchParams as any)?.platform || 'linkedin';
        const leadCount = (job.metadata?.leadCount as number) || 0;
        await notifyScrapeCompleted(job.jobId, platform as 'linkedin' | 'facebook', leadCount);
      }
    }
  } catch (error) {
    console.error('[NOTIFICATIONS] Failed to check job status:', error);
  }
}

