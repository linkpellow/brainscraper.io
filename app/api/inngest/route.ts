/**
 * Inngest API Route Handler
 * 
 * This endpoint receives webhooks from Inngest to trigger background functions
 */

import { serve } from 'inngest/next';
import { inngest } from '@/utils/inngest';
import { enrichmentFunctions } from '@/utils/inngest/enrichment';
import { scrapingFunctions } from '@/utils/inngest/scraping';

// Start automatic orphan recovery
if (typeof window === 'undefined') {
  try {
    const { startOrphanRecovery } = require('@/utils/orphanRecoveryJob');
    startOrphanRecovery();
  } catch (error) {
    console.warn('[INNGEST] Failed to start orphan recovery:', error);
  }
}

// Validate Inngest configuration (warn if missing in production)
if (process.env.NODE_ENV === 'production') {
  if (!process.env.INNGEST_EVENT_KEY && !process.env.INNGEST_SIGNING_KEY) {
    console.warn('⚠️ Inngest keys not configured - background jobs may not work in production');
    console.warn('   Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY environment variables');
  }
}

// Get base URL for Inngest webhooks
function getInngestBaseUrl(): string {
  // Explicit configuration
  const explicit = 
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.BASE_URL ||
    '';
  
  if (explicit) {
    return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  }
  
  // Railway provides RAILWAY_PUBLIC_DOMAIN
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  
  // Vercel provides VERCEL_URL
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  
  // Default to brainscraper.io if in production
  if (process.env.NODE_ENV === 'production') {
    return 'https://brainscraper.io';
  }
  
  // Development fallback
  return 'http://localhost:3000';
}

// Log function registration
if (typeof window === 'undefined') {
  const baseUrl = getInngestBaseUrl();
  console.log(`[INNGEST] Registering ${enrichmentFunctions.length} enrichment functions and ${scrapingFunctions.length} scraping functions`);
  console.log(`[INNGEST] Base URL: ${baseUrl}`);
  console.log(`[INNGEST] Functions:`, {
    enrichment: enrichmentFunctions.map(f => f.id || 'unknown'),
    scraping: scrapingFunctions.map(f => f.id || 'unknown'),
  });
}

// Export the Inngest serve handler
// Note: baseUrl in serve() is for Inngest API, not your endpoint
// Inngest auto-discovers your endpoint when you visit /api/inngest
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...enrichmentFunctions,
    ...scrapingFunctions,
  ],
  // Signing key for webhook verification
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
