/**
 * Inngest function: WARN list → LinkedIn company match + employee extraction
 * For each WARN row: company search then people search; aggregate leads and save.
 */

import { inngest, warnEvents, enrichmentEvents } from '../inngest';
import type { NormalizedWarnRow } from '../warn';
import { saveJobResults } from '../jobResults';
import {
  saveJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
  generateJobId,
} from '../jobStatus';
import { normalizeStationConfig } from '../enrichmentStations';

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

function parseLocation(location: string | null | undefined): { city?: string; state?: string } {
  if (!location) return {};
  const parts = String(location)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};
  const city = parts[0];
  const statePart = parts.find((p) => /^[A-Z]{2}$/.test(p)) || parts[1];
  const state = statePart ? statePart.trim() : undefined;
  return { city, state };
}

function buildName(person: any): { fullName: string; firstName: string; lastName: string } {
  const fullName =
    (typeof person?.fullName === 'string' && person.fullName.trim()) ||
    (typeof person?.name === 'string' && person.name.trim()) ||
    `${person?.firstName || ''} ${person?.lastName || ''}`.trim() ||
    'Unknown';

  const firstName =
    (typeof person?.firstName === 'string' && person.firstName.trim()) || fullName.split(' ')[0] || '';
  const lastName =
    (typeof person?.lastName === 'string' && person.lastName.trim()) ||
    fullName.split(' ').slice(1).join(' ') ||
    '';

  return { fullName, firstName, lastName };
}

function toParsedDataForEnrichment(leads: any[]) {
  const headers = [
    'Name',
    'First Name',
    'Last Name',
    'City',
    'State',
    'LinkedIn URL',
    'Title',
    'Company',
    'Lead Source',
    'WARN Lead',
    'WARN Company',
  ];

  const rows = leads.map((lead) => {
    const { fullName, firstName, lastName } = buildName(lead);
    const location = parseLocation(
      lead?.geoRegion || lead?.location || lead?.region || lead?.cityState || null
    );
    const linkedinUrl =
      lead?.profileUrl || lead?.navigationUrl || lead?.url || lead?.linkedinUrl || '';
    const title =
      lead?.currentPosition?.title || lead?.title || lead?.headline || lead?.jobTitle || '';
    const company =
      lead?.currentPosition?.companyName ||
      lead?.companyName ||
      lead?.company ||
      lead?._warnMatchedCompany ||
      '';

    return {
      'Name': fullName,
      'First Name': firstName,
      'Last Name': lastName,
      'City': location.city || '',
      'State': location.state || '',
      'LinkedIn URL': linkedinUrl,
      'Title': title,
      'Company': company,
      'Lead Source': 'warn',
      'WARN Lead': 'true',
      'WARN Company': lead?._warnSourceCompany || '',
    };
  });

  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
  };
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
      autoEnrich = true,
      enabledStations,
    } = event.data as {
      jobId: string;
      warnRows: NormalizedWarnRow[];
      maxCompanies?: number;
      maxLeadsPerCompany?: number;
      autoEnrich?: boolean;
      enabledStations?: string[];
    };

    const capped = Math.min(Math.max(1, maxCompanies), MAX_COMPANIES_CAP);
    const rowsToProcess = warnRows.slice(0, capped);
    const normalizedStations = enabledStations
      ? Array.from(normalizeStationConfig(enabledStations).stations)
      : undefined;

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
                leads.push({
                  ...p,
                  _warnSourceCompany: row.companyName,
                  _warnMatchedCompany: companyName,
                });
              } else if (!url) {
                leads.push({
                  ...p,
                  _warnSourceCompany: row.companyName,
                  _warnMatchedCompany: companyName,
                });
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

      const enrichmentJobId = await step.run('trigger-enrichment', async () => {
        if (!autoEnrich || allLeads.length === 0) {
          return null;
        }

        const enrichJobId = generateJobId('enrichment');
        const parsedData = toParsedDataForEnrichment(allLeads);

        saveJobStatus({
          jobId: enrichJobId,
          type: 'enrichment',
          status: 'pending',
          progress: { current: 0, total: parsedData.rows.length, percentage: 0 },
          startedAt: new Date().toISOString(),
          metadata: {
            source: 'warn-auto-enrich',
            parentJobId: jobId,
            ...(normalizedStations ? { enabledStations: normalizedStations } : {}),
          },
        });

        await inngest.send({
          name: enrichmentEvents.enrichLeads,
          data: {
            jobId: enrichJobId,
            parsedData,
            metadata: {
              source: 'warn-auto-enrich',
              parentJobId: jobId,
              ...(normalizedStations ? { enabledStations: normalizedStations } : {}),
            },
            ...(normalizedStations ? { enabledStations: normalizedStations } : {}),
          },
        });

        return enrichJobId;
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
          autoEnrich,
          ...(enrichmentJobId ? { enrichmentJobId } : {}),
        });
        return { success: true };
      });

      return {
        success: true,
        jobId,
        leadsCount: allLeads.length,
        companiesMatched,
        autoEnrich,
        enrichmentJobId: enrichmentJobId || undefined,
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
