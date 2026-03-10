/**
 * Inngest function: WARN list → LinkedIn company match + employee extraction
 * For each WARN row: company search then people search; aggregate leads and save.
 */

import { inngest, warnEvents } from '../inngest';
import type { NormalizedWarnRow } from '../warn';
import { saveJobResults } from '../jobResults';
import {
  saveJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
} from '../jobStatus';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const DELAY_BETWEEN_COMPANIES_MS = 2000;
const DEFAULT_MAX_COMPANIES = 20;
const DEFAULT_MAX_LEADS_PER_COMPANY = 25;
const MAX_COMPANIES_CAP = 50;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getResponseData(result: any): any[] {
  const data = result?.data?.response?.data ?? result?.response?.data ?? result?.data?.data?.response?.data;
  return Array.isArray(data) ? data : [];
}

function getFirstCompanyName(row: NormalizedWarnRow, companies: any[]): string | null {
  const first = companies[0];
  if (!first) return null;
  const name = first?.name ?? first?.title ?? first?.companyName;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export const warnMatchLinkedInFunction = inngest.createFunction(
  {
    id: 'warn-match-linkedin',
    name: 'WARN Match to LinkedIn & Extract Employees',
    retries: 2,
  },
  { event: warnEvents.warnMatchLinkedIn },
  async ({ event, step }) => {
    const {
      jobId,
      warnRows,
      maxCompanies = DEFAULT_MAX_COMPANIES,
      maxLeadsPerCompany = DEFAULT_MAX_LEADS_PER_COMPANY,
    } = event.data as {
      jobId: string;
      warnRows: NormalizedWarnRow[];
      maxCompanies?: number;
      maxLeadsPerCompany?: number;
    };

    const capped = Math.min(Math.max(1, maxCompanies), MAX_COMPANIES_CAP);
    const rowsToProcess = warnRows.slice(0, capped);

    try {
      await step.run('set-running', async () => {
        saveJobStatus({
          jobId,
          type: 'scraping',
          status: 'running',
          progress: { current: 0, total: rowsToProcess.length, percentage: 0 },
          startedAt: new Date().toISOString(),
          metadata: { source: 'warn', companyCount: rowsToProcess.length },
        });
        return { ok: true };
      });

      const { allLeads, companiesMatched, rawByCompany } = await step.run('match-and-fetch', async () => {
        const leads: any[] = [];
        const seenUrls = new Set<string>();
        const rawAccum: { company: string; location: string; response: any }[] = [];

        for (let i = 0; i < rowsToProcess.length; i++) {
          const row = rowsToProcess[i];
          const locationText = [row.city, row.stateOrCounty].filter(Boolean).join(', ') || 'United States';

          const companyRes = await fetch(BASE_URL + '/api/linkedin-sales-navigator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: 'premium_search_company',
              keywords: row.companyName,
              location: locationText,
              start: 0,
              count: 5,
            }),
          });

          if (!companyRes.ok) {
            console.warn('[WARN_MATCH] Company search failed for ' + row.companyName + ': ' + companyRes.status);
            await delay(DELAY_BETWEEN_COMPANIES_MS);
            continue;
          }

          const companyResult = await companyRes.json();
          const companies = getResponseData(companyResult);
          const companyName = getFirstCompanyName(row, companies) ?? row.companyName;
          rawAccum.push({
            company: row.companyName,
            location: locationText,
            response: companyResult,
          });

          let page = 0;
          let hasMore = true;
          const pageSize = 25;

          while (hasMore) {
            const personRes = await fetch(BASE_URL + '/api/linkedin-sales-navigator', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: 'premium_search_person',
                current_company: companyName,
                location: locationText,
                start: page * pageSize,
                count: pageSize,
              }),
            });

            if (!personRes.ok) {
              hasMore = false;
              break;
            }

            const personResult = await personRes.json();
            const people = getResponseData(personResult);

            for (const p of people) {
              const url = p?.profileUrl ?? p?.url ?? p?.linkedinUrl;
              if (url && !seenUrls.has(url)) {
                seenUrls.add(url);
                leads.push(p);
              } else if (!url) {
                leads.push(p);
              }
            }

            if (people.length < pageSize) {
              hasMore = false;
            } else {
              page++;
              await delay(1500);
            }
          }

          updateJobProgress(jobId, { current: i + 1, total: rowsToProcess.length });
          await delay(DELAY_BETWEEN_COMPANIES_MS);
        }

        return {
          allLeads: leads,
          companiesMatched: rawAccum.length,
          rawByCompany: rawAccum,
        };
      });

      const rawAggregate = {
        jobId,
        companyCount: companiesMatched,
        leadCount: allLeads.length,
        byCompany: rawByCompany,
      };

      await step.run('save-api-results', async () => {
        try {
          const { saveApiResults } = await import('../saveApiResults');
          await saveApiResults(
            'warn-linkedin-match',
            { jobId, companyCount: companiesMatched, leadCount: allLeads.length },
            rawAggregate,
            allLeads
          );
        } catch (e) {
          console.warn('[WARN_MATCH] saveApiResults failed:', e);
        }
        return { ok: true };
      });

      await step.run('save-job-results', async () => {
        await saveJobResults(jobId, 'scraping', allLeads);
        return { count: allLeads.length };
      });

      await step.run('track-usage', async () => {
        try {
          const { incrementScrapeCount } = await import('../scrapeUsageTracker');
          if (allLeads.length > 0) {
            await incrementScrapeCount('linkedin', allLeads.length, jobId);
          }
        } catch {}
        return { success: true };
      });

      await step.run('notify-complete', async () => {
        try {
          const { notifyScrapeCompleted } = await import('../notifications');
          await notifyScrapeCompleted(jobId, 'linkedin', allLeads.length);
        } catch {}
        return { success: true };
      });

      await step.run('mark-completed', async () => {
        await completeJob(jobId, {
          leadsCount: allLeads.length,
          companiesMatched,
          resultCount: allLeads.length,
          source: 'warn',
        });
        return { success: true };
      });

      return {
        success: true,
        jobId,
        leadsCount: allLeads.length,
        companiesMatched,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      try {
        const { recordError } = await import('../cooldownManager');
        await recordError();
      } catch {}
      try {
        const { notifyErrorsDetected } = await import('../notifications');
        await notifyErrorsDetected(jobId, 1, [message]);
      } catch {}
      await failJob(jobId, message);
      throw error;
    }
  }
);
