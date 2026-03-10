import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import { spawn } from 'child_process';
import { getDataFilePath, ensureDataDirectory, safeWriteFile } from '@/utils/dataDirectory';
import { ingestWarnFile } from '@/utils/warn';
import type { NormalizedWarnRow } from '@/utils/warn';

const SCRAPE_TIMEOUT_MS = 120_000;
const SCRAPEGRAPH_DIR = process.env.SCRAPEGRAPH_PROJECT_PATH || '.cache/Scrapegraph-ai';

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

function parseJsonSafe(str: string): unknown | undefined {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

/** Scrapegraph/libs may print to stdout; our script prints a single JSON array line. Extract it. */
function extractJsonArrayFromStdout(stdout: string): unknown | undefined {
  const lines = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith('[')) {
      const parsed = parseJsonSafe(line);
      if (Array.isArray(parsed)) return parsed;
    }
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : undefined;

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return NextResponse.json(
        { success: false, error: 'Valid url (http or https) is required' },
        { status: 400 }
      );
    }

    const projectRoot = process.cwd();
    const scriptPath = path.join(projectRoot, 'scripts', 'scrape_warn_url.py');
    const scrapegraphDir = path.isAbsolute(SCRAPEGRAPH_DIR)
      ? SCRAPEGRAPH_DIR
      : path.join(projectRoot, SCRAPEGRAPH_DIR);

    const args = ['run', 'python', scriptPath, '--url', url];
    if (prompt) args.push('--prompt', prompt);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const child = spawn('uv', args, {
      cwd: scrapegraphDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, SCRAPE_TIMEOUT_MS);

    const exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code ?? -1);
      });
    });

    const stdout = Buffer.concat(stdoutChunks).toString('utf-8').trim();
    const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();

    if (exitCode !== 0) {
      const parsedErr = parseJsonSafe(stdout);
      const errMsg = stdout
        ? (parsedErr && typeof parsedErr === 'object' && 'error' in parsedErr
            ? (parsedErr as { error: string }).error
            : stdout)
        : stderr || 'Scrape failed';
      console.error('[warn/scrape]', stderr || errMsg);
      return NextResponse.json(
        { success: false, error: typeof errMsg === 'string' ? errMsg : 'Scrape failed' },
        { status: 500 }
      );
    }

    let data: unknown = parseJsonSafe(stdout);
    if (data === undefined) {
      data = extractJsonArrayFromStdout(stdout);
    }
    if (data === undefined) {
      return NextResponse.json(
        { success: false, error: 'Scraper did not return valid JSON' },
        { status: 500 }
      );
    }

    if (data !== null && typeof data === 'object' && 'error' in data) {
      const err = (data as { error: string }).error;
      return NextResponse.json({ success: false, error: err }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
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
        warnings: ['No rows extracted from page'],
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
      warnings,
    });
  } catch (error) {
    console.error('[warn/scrape]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
