import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, ensureDataDirectory, safeWriteFile } from '@/utils/dataDirectory';
import { ingestWarnFile } from '@/utils/warn';
import { scrapeWarnFromUrl } from '@/utils/warn/scrapeWarnFromUrl';

export const maxDuration = 120;

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function domainFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/\./g, '-') || 'scraped';
  } catch {
    return 'scraped';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return NextResponse.json(
        { success: false, error: 'Valid url (http or https) is required' },
        { status: 400 }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7820/ingest/fdb61876-992c-4620-8677-59e336c96a1e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9905c3'},body:JSON.stringify({sessionId:'9905c3',location:'app/api/warn/scrape/route.ts:start',message:'scrape_api_start',data:{url},hypothesisId:'H5',timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const scraped = await scrapeWarnFromUrl(url);
    const rows = scraped.rows;
    const scrapeWarnings = scraped.warnings;
    // #region agent log
    fetch('http://127.0.0.1:7820/ingest/fdb61876-992c-4620-8677-59e336c96a1e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9905c3'},body:JSON.stringify({sessionId:'9905c3',location:'app/api/warn/scrape/route.ts:parsed',message:'scrape_api_parsed',data:{rowsLength:rows.length},hypothesisId:'H4,H5',timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (rows.length === 0) {
      ensureDataDirectory();
      const timestamp = Date.now();
      const id = shortId();
      const filename = `warn_${timestamp}_${id}.json`;
      const relativePath = `warn/${filename}`;
      const filePath = getDataFilePath(relativePath);
      safeWriteFile(
        filePath,
        JSON.stringify({ rows: [], meta: { ingestedAt: new Date().toISOString(), source: url } }, null, 2)
      );
      return NextResponse.json({
        success: true,
        rows: [],
        totalRows: 0,
        savedPath: relativePath,
        warnings: [...scrapeWarnings, 'No rows extracted from page'],
      });
    }

    const first = rows[0];
    const headers =
      first && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as Record<string, unknown>)
        : [];
    const parsedRows = rows.map((r) =>
      r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, string | number>) : {}
    );

    const parsedData = {
      headers,
      rows: parsedRows,
      rowCount: parsedRows.length,
      columnCount: headers.length,
    };
    const sourceFile = `scraped-${domainFromUrl(url)}.json`;
    const { rows: normalizedRows, warnings } = ingestWarnFile(parsedData, sourceFile);

    ensureDataDirectory();
    const timestamp = Date.now();
    const id = shortId();
    const filename = `warn_${timestamp}_${id}.json`;
    const relativePath = `warn/${filename}`;
    const filePath = getDataFilePath(relativePath);
    const payload = {
      rows: normalizedRows,
      meta: {
        ingestedAt: new Date().toISOString(),
        source: url,
        scraped: true,
      },
    };
    safeWriteFile(filePath, JSON.stringify(payload, null, 2));

    return NextResponse.json({
      success: true,
      rows: normalizedRows,
      totalRows: normalizedRows.length,
      savedPath: relativePath,
      warnings: [...scrapeWarnings, ...warnings],
    });
  } catch (error) {
    console.error('[warn/scrape]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
