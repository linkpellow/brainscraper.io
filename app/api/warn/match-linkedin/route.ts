/**
 * POST /api/warn/match-linkedin
 * Start background job: match WARN rows to LinkedIn companies and extract employees.
 */

import { NextRequest, NextResponse } from 'next/server';
import { inngest, warnEvents } from '@/utils/inngest';
import { generateJobId, saveJobStatus } from '@/utils/jobStatus';
import { type NormalizedWarnRow, isNormalizedWarnRow } from '@/utils/warn';
import { normalizeStationId } from '@/utils/enrichmentStations';

const MAX_ROWS = 100;
const DEFAULT_MAX_COMPANIES = 20;
const MAX_COMPANIES_CAP = 50;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      rows,
      maxCompanies = DEFAULT_MAX_COMPANIES,
      autoEnrich = true,
      enabledStations,
    } = body as {
      rows: unknown;
      maxCompanies?: number;
      autoEnrich?: boolean;
      enabledStations?: unknown;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'rows must be a non-empty array' },
        { status: 400 }
      );
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_ROWS} rows per request` },
        { status: 400 }
      );
    }

    if (enabledStations !== undefined && !Array.isArray(enabledStations)) {
      return NextResponse.json(
        { success: false, error: 'enabledStations must be an array when provided' },
        { status: 400 }
      );
    }

    const stationList = Array.isArray(enabledStations)
      ? enabledStations.filter((s): s is string => typeof s === 'string')
      : undefined;

    if (Array.isArray(enabledStations) && stationList && stationList.length !== enabledStations.length) {
      return NextResponse.json(
        { success: false, error: 'enabledStations must contain only string station ids' },
        { status: 400 }
      );
    }

    const invalidStations = stationList?.filter(station => !normalizeStationId(station)) || [];
    if (invalidStations.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid enabledStations value(s): ${invalidStations.join(', ')}` },
        { status: 400 }
      );
    }

    const validRows = rows.filter(isNormalizedWarnRow) as NormalizedWarnRow[];
    if (validRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No valid WARN rows (require companyName, city, stateOrCounty, layoffCount, layoffDate, noticeDate, sourceFile)',
        },
        { status: 400 }
      );
    }

    const jobId = generateJobId('scraping');
    const capped = Math.min(Math.max(1, maxCompanies), MAX_COMPANIES_CAP);

    saveJobStatus({
      jobId,
      type: 'scraping',
      status: 'pending',
      progress: { current: 0, total: validRows.length, percentage: 0 },
      startedAt: new Date().toISOString(),
      metadata: {
        source: 'warn',
        companyCount: validRows.length,
        maxCompanies: capped,
        autoEnrich,
        ...(stationList ? { enabledStations: stationList } : {}),
      },
    });

    await inngest.send({
      name: warnEvents.warnMatchLinkedIn,
      data: {
        jobId,
        warnRows: validRows,
        maxCompanies: capped,
        autoEnrich,
        enabledStations: stationList,
      },
    });

    return NextResponse.json({
      success: true,
      jobId,
      autoEnrich,
      message:
        `WARN match to LinkedIn job started${autoEnrich ? ' with automatic enrichment handoff' : ''}. Monitor progress in Background Jobs.`,
    });
  } catch (error) {
    console.error('[WARN_MATCH_LINKEDIN]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
