/**
 * Inngest function: Facebook automated lead search
 * Search posts (and optionally ads) by keyword, collect commenters, optionally fetch location.
 */

import { inngest, facebookEvents } from '../inngest';
import { saveJobResults } from '../jobResults';
import {
  saveJobStatusAsync,
  updateJobProgress,
  completeJob,
  failJob,
} from '../jobStatus';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const DELAY_MS = 1800;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseAddress(address: string | null | undefined): { city?: string; state?: string } {
  if (!address || typeof address !== 'string') return {};
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};
  const statePart = parts.find((p) => /^[A-Z]{2}$/.test(p) || p.length === 2);
  const stateIdx = statePart ? parts.indexOf(statePart) : -1;
  if (stateIdx <= 0) return {};
  return { city: parts[stateIdx - 1], state: parts[stateIdx] };
}

type LeadOutput = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  city?: string;
  state?: string;
  source: string;
  platform: 'facebook';
  addedAt: string;
  enriched: boolean;
  dncChecked: boolean;
};

export const facebookAutomatedLeadSearchFunction = inngest.createFunction(
  {
    id: 'facebook-automated-lead-search',
    name: 'Facebook Automated Lead Search',
    retries: 2,
  },
  { event: facebookEvents.automatedLeadSearch },
  async ({ event, step }) => {
    const jobId = (event.data as { jobId: string }).jobId;
    try {
    const {
      queries,
      maxPostsPerQuery = 20,
      maxCommentsPerPost = 50,
      includeAds = false,
      country = 'US',
    } = event.data as {
      queries: string[];
      maxPostsPerQuery?: number;
      maxCommentsPerPost?: number;
      includeAds?: boolean;
      country?: string;
    };

    await step.run('init', async () => {
      await saveJobStatusAsync({
        jobId,
        type: 'facebook_automated',
        status: 'running',
        progress: { current: 0, total: queries.length, percentage: 0 },
        startedAt: new Date().toISOString(),
        metadata: { queries, maxPostsPerQuery, maxCommentsPerPost, includeAds },
      });
      return { ok: true };
    });

    const { postUrls } = await step.run('gather-urls', async () => {
      const allUrls: string[] = [];
      for (const query of queries) {
        let endCursor: string | undefined;
        let pageCount = 0;
        while (pageCount < maxPostsPerQuery) {
          const res = await fetch(`${BASE_URL}/api/facebook-posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'search_posts', query, ...(endCursor && { end_cursor: endCursor }) }),
          });
          await delay(DELAY_MS);
          if (!res.ok) break;
          const json = await res.json();
          if (!json.success || !json.data) break;
          const data = json.data?.data || json.data;
          const items = data?.items || [];
          for (const item of items) {
            const url = item?.basic_info?.url || item?.url;
            if (url && typeof url === 'string') allUrls.push(url);
          }
          pageCount += items.length;
          const nextCursor = data?.page_info?.cursor;
          if (!nextCursor || items.length === 0) break;
          endCursor = nextCursor;
          if (items.length < 5) break;
        }
      }
      if (includeAds) {
        for (const query of queries) {
          let endCursor: string | undefined;
          for (let page = 0; page < 5; page++) {
            const res = await fetch(`${BASE_URL}/api/facebook-posts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'fetch_search_ads_pages',
                query,
                country,
                ...(endCursor && { end_cursor: endCursor }),
              }),
            });
            await delay(DELAY_MS);
            if (!res.ok) break;
            const json = await res.json();
            if (!json.success || !json.data) break;
            const data = json.data?.data || json.data;
            const items = data?.items || data?.data || [];
            for (const ad of Array.isArray(items) ? items : []) {
              const link = ad?.link || ad?.url || ad?.snapshot_url || ad?.ad_snapshot_url;
              if (link && typeof link === 'string' && link.includes('facebook.com')) allUrls.push(link);
            }
            const nextCursor = data?.page_info?.cursor || data?.page_info?.end_cursor;
            if (!nextCursor || items.length === 0) break;
            endCursor = nextCursor;
          }
        }
      }
      return { postUrls: allUrls };
    });

    const { commenters } = await step.run('gather-commenters', async () => {
      const seen = new Set<string>();
      const list: Array<{ name: string; profileUrl: string | null }> = [];
      const limit = Math.min(postUrls.length, 50);
      for (let i = 0; i < limit; i++) {
        const res = await fetch(`${BASE_URL}/api/facebook-posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'post_comments', link: postUrls[i] }),
        });
        await delay(DELAY_MS);
        if (!res.ok) continue;
        const json = await res.json();
        if (!json.success || !json.data) continue;
        const data = json.data?.data || json.data;
        const comments = data?.comments || [];
        for (const c of comments) {
          const name = c?.author?.name || '';
          const profileUrl = c?.author?.url || null;
          if (!name) continue;
          const key = profileUrl || name;
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ name, profileUrl });
        }
        await updateJobProgress(jobId, { current: i + 1, total: limit });
      }
      return { commenters: list };
    });

    const { leads } = await step.run('build-leads', async () => {
      const out: LeadOutput[] = [];
      for (let i = 0; i < commenters.length; i++) {
        const c = commenters[i];
        let city: string | undefined;
        let state: string | undefined;
        if (c.profileUrl) {
          try {
            const res = await fetch(`${BASE_URL}/api/facebook-posts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'page_details', link: c.profileUrl }),
            });
            await delay(DELAY_MS);
            if (res.ok) {
              const json = await res.json();
              const parsed = parseAddress(json.data?.address);
              city = parsed.city;
              state = parsed.state;
            }
          } catch {
            // skip
          }
        }
        const nameParts = (c.name || 'Unknown').split(' ');
        out.push({
          id: `fb-auto-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          name: c.name || 'Unknown',
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          city,
          state,
          source: 'Facebook automated',
          platform: 'facebook',
          addedAt: new Date().toISOString(),
          enriched: false,
          dncChecked: false,
        });
      }
      return { leads: out };
    });

    await step.run('save-results', async () => {
      await saveJobResults(jobId, 'facebook_automated', leads);
      await completeJob(jobId, { leadCount: leads.length });
      return { count: leads.length };
    });

    return { leadsCount: leads.length };
    } catch (error) {
      await step.run('mark-failed', async () => {
        await failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
        return { failed: true };
      });
      throw error;
    }
  }
);
