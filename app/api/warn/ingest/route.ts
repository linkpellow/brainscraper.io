import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, ensureDataDirectory, safeWriteFile } from '@/utils/dataDirectory';
import { parseFile } from '@/utils/parseFile';
import { ingestWarnFile } from '@/utils/warn';
import type { NormalizedWarnRow } from '@/utils/warn';

const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.xlsm'];

function isAcceptedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Request body too large (max 20MB)' },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const fileList = formData.getAll('file').concat(formData.getAll('files'));
    const files = fileList.filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No file(s) provided. Use "file" or "files".' },
        { status: 400 }
      );
    }

    const results: {
      fileName: string;
      rows: NormalizedWarnRow[];
      warnings: string[];
      savedPath?: string;
    }[] = [];
    const allRows: NormalizedWarnRow[] = [];

    ensureDataDirectory();

    for (const file of files) {
      if (!isAcceptedFile(file.name)) {
        results.push({
          fileName: file.name,
          rows: [],
          warnings: [`Skipped: unsupported format. Use ${ACCEPTED_EXTENSIONS.join(', ')}`],
        });
        continue;
      }

      const result = await parseFile(file);
      if (!result.success || !result.data) {
        results.push({
          fileName: file.name,
          rows: [],
          warnings: [result.error ?? 'Parse error'],
        });
        continue;
      }
      const parsed = result.data;

      if (!parsed.headers?.length) {
        results.push({
          fileName: file.name,
          rows: [],
          warnings: ['No headers in file'],
        });
        continue;
      }

      const data = {
        headers: parsed.headers,
        rows: parsed.rows,
        rowCount: parsed.rows.length,
        columnCount: parsed.headers.length,
      };
      const { rows, warnings, profileId } = ingestWarnFile(data, file.name);
      results.push({ fileName: file.name, rows, warnings });
      allRows.push(...rows);
    }

    const timestamp = Date.now();
    const id = shortId();
    const filename = `warn_${timestamp}_${id}.json`;
    const relativePath = `warn/${filename}`;
    const filePath = getDataFilePath(relativePath);
    const payload = {
      rows: allRows,
      meta: {
        ingestedAt: new Date().toISOString(),
        fileCount: files.length,
        fileNames: files.map((f) => f.name),
      },
    };
    safeWriteFile(filePath, JSON.stringify(payload, null, 2));
    results.forEach((r, i) => {
      if (r.rows.length) (results[i] as typeof r & { savedPath?: string }).savedPath = relativePath;
    });

    return NextResponse.json({
      success: true,
      data: results,
      savedPath: relativePath,
      totalRows: allRows.length,
    });
  } catch (error) {
    console.error('[warn/ingest]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Ingest failed',
      },
      { status: 500 }
    );
  }
}
