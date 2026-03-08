import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import { saveFullRun, type ApiResultMetadata } from '@/utils/saveApiResults';

function sanitizeSearchParams(params: Record<string, unknown>): Record<string, unknown> {
  const out = { ...params };
  delete out.rapidApiKey;
  delete out.RAPIDAPI_KEY;
  delete out.runId;
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      runId,
      endpoint,
      searchParams = {},
      processedResults,
      pagination,
    } = body;

    if (!runId || typeof runId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'runId is required' },
        { status: 400 }
      );
    }
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json(
        { success: false, error: 'endpoint is required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(processedResults)) {
      return NextResponse.json(
        { success: false, error: 'processedResults must be an array' },
        { status: 400 }
      );
    }

    const sanitized = sanitizeSearchParams(
      typeof searchParams === 'object' && searchParams !== null ? searchParams : {}
    );
    const filters = Array.isArray(sanitized.filters) ? sanitized.filters : [];

    const metadata: ApiResultMetadata = {
      timestamp: new Date().toISOString(),
      endpoint,
      searchParams: sanitized,
      resultCount: processedResults.length,
      hasPagination: true,
      pagination: pagination && typeof pagination === 'object'
        ? {
            total: pagination.total,
            count: processedResults.length,
            start: 0,
            hasMore: false,
          }
        : {
            total: processedResults.length,
            count: processedResults.length,
            start: 0,
            hasMore: false,
          },
      filters: filters.length > 0 ? filters : undefined,
      keywords: typeof sanitized.keywords === 'string' ? sanitized.keywords : undefined,
      location: typeof sanitized.location === 'string' ? sanitized.location : undefined,
    };

    const filepath = await saveFullRun(metadata, processedResults, runId);
    if (!filepath) {
      return NextResponse.json(
        { success: false, error: 'Failed to write file' },
        { status: 500 }
      );
    }

    const filename = path.basename(filepath);
    return NextResponse.json({ success: true, filename });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SCRAPE_HISTORY_SAVE]', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
