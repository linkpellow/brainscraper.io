import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getDataDirectory } from '@/utils/dataDirectory';

export interface WarnListEntry {
  filename: string;
  path: string;
  rowCount: number;
  ingestedAt?: string;
}

export async function GET() {
  try {
    const dataDir = getDataDirectory();
    const warnDir = path.join(dataDir, 'warn');
    if (!fs.existsSync(warnDir)) {
      return NextResponse.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(warnDir).filter((f) => f.endsWith('.json') && f.startsWith('warn_'));
    const entries: WarnListEntry[] = [];

    for (const filename of files) {
      const filePath = path.join(warnDir, filename);
      let rowCount = 0;
      let ingestedAt: string | undefined;
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.rows)) {
          rowCount = data.rows.length;
        } else if (data.rows && Array.isArray(data.rows)) {
          rowCount = data.rows.length;
        }
        if (data.meta?.ingestedAt) ingestedAt = data.meta.ingestedAt;
      } catch {
        // ignore parse errors
      }
      entries.push({
        filename,
        path: `warn/${filename}`,
        rowCount,
        ...(ingestedAt ? { ingestedAt } : {}),
      });
    }

    entries.sort((a, b) => b.filename.localeCompare(a.filename));

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error('[warn/lists]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'List failed' },
      { status: 500 }
    );
  }
}
