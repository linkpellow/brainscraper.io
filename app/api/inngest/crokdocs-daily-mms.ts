import { inngest } from '@/utils/inngest';

/**
 * Scheduled function to send CrokDocs daily report via MMS
 * Runs every day at 8:00 PM (20:00) Monday through Friday
 * Based on Telnyx MMS API: https://developers.telnyx.com/docs/messaging/messages/send-receive-mms
 */

export const sendCrokDocsDailyMMS = inngest.createFunction(
  {
    id: 'crokdocs-daily-mms',
    name: 'Send CrokDocs Daily MMS Report',
  },
  {
    cron: '0 20 * * 1-5', // 8:00 PM Monday-Friday (0 20 * * 1-5)
  },
  async ({ step }) => {
    const recipientPhone = process.env.CROKDOCS_MMS_RECIPIENT || '+12694621403';
    
    return await step.run('send-mms', async () => {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'https://brainscraper.io';
      const response = await fetch(`${baseUrl}/api/crokdocs/send-mms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: recipientPhone,
          test: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to send MMS: ${error}`);
      }

      const result = await response.json();
      return result;
    });
  }
);
