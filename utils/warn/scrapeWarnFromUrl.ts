import * as cheerio from 'cheerio';

const REQUEST_TIMEOUT_MS = 30_000;

type ScrapedWarnRow = Record<string, string | number>;

type ScrapeWarnResult = {
  rows: ScrapedWarnRow[];
  warnings: string[];
};

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function headerKey(input: string): string {
  return normalizeText(input).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function parseCount(input: string): string | number {
  const match = input.replace(/,/g, '').match(/\b\d{1,7}\b/);
  if (!match) return '';
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : '';
}

function pickValue(
  source: Record<string, string>,
  aliases: string[],
  fallbackIndex?: number,
  rowValues?: string[]
): string {
  for (const alias of aliases) {
    const value = source[alias];
    if (value) return value;
  }
  if (fallbackIndex !== undefined && rowValues && rowValues[fallbackIndex]) {
    return rowValues[fallbackIndex];
  }
  return '';
}

function extractRowsFromTable(
  $: ReturnType<typeof cheerio.load>,
  $table: cheerio.Cheerio
): ScrapedWarnRow[] {
  const rows: ScrapedWarnRow[] = [];
  const tableRows = $table.find('tr').toArray();
  if (tableRows.length < 2) return rows;

  const headerCells = $(tableRows[0]).find('th,td').toArray();
  const headers = headerCells.map((cell) => headerKey($(cell).text()));
  if (headers.length === 0) return rows;

  for (const tableRow of tableRows.slice(1)) {
    const cells = $(tableRow).find('td,th').toArray();
    if (cells.length === 0) continue;

    const values = cells.map((cell) => normalizeText($(cell).text()));
    if (values.every((v) => !v)) continue;

    const mappedByHeader: Record<string, string> = {};
    headers.forEach((h, idx) => {
      mappedByHeader[h] = values[idx] || '';
    });

    const companyName = pickValue(
      mappedByHeader,
      ['company', 'company name', 'employer', 'employer name', 'business', 'job site name', 'name'],
      0,
      values
    );
    if (!companyName) continue;

    const city = pickValue(mappedByHeader, ['city', 'job site city', 'location'], 1, values);
    const stateOrCounty = pickValue(
      mappedByHeader,
      ['state', 'county', 'state or county', 'county name', 'region', 'st'],
      2,
      values
    );
    const layoffCountRaw = pickValue(
      mappedByHeader,
      ['layoffs', 'layoff count', 'number of jobs impacted', 'number affected', 'workers affected', 'total layoffs'],
      3,
      values
    );
    const layoffDate = pickValue(
      mappedByHeader,
      ['layoff date', 'layoff dates', 'effective date', 'closure date', 'date'],
      4,
      values
    );
    const noticeDate = pickValue(
      mappedByHeader,
      ['notice date', 'received date', 'filed', 'start date'],
      5,
      values
    );

    rows.push({
      companyName,
      city,
      stateOrCounty,
      layoffCount: parseCount(layoffCountRaw),
      layoffDate,
      noticeDate,
    });
  }

  return rows;
}

export async function scrapeWarnFromUrl(url: string): Promise<ScrapeWarnResult> {
  const warnings: string[] = [];
  let html = '';

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }

    html = await response.text();
  } catch (error) {
    throw new Error(
      error instanceof Error ? `WARN page fetch failed: ${error.message}` : 'WARN page fetch failed'
    );
  }

  if (!html.trim()) {
    return { rows: [], warnings: ['Fetched page is empty'] };
  }

  const $ = cheerio.load(html);
  const tableElements = $('table').toArray();
  const extractedRows: ScrapedWarnRow[] = [];

  for (const table of tableElements) {
    extractedRows.push(...extractRowsFromTable($, $(table)));
  }

  if (tableElements.length === 0) {
    warnings.push('No tables found on page');
  }
  if (extractedRows.length === 0) {
    warnings.push('No WARN-like rows could be extracted from page');
  }

  return {
    rows: extractedRows,
    warnings,
  };
}
