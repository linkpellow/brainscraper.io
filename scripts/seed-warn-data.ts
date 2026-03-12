#!/usr/bin/env tsx
/**
 * Seed WARN data from local files into data/warn/.
 * Usage:
 *   tsx scripts/seed-warn-data.ts [file1.csv] [file2.xlsx] ...
 *   WARN_FILES="/path/to/a.csv,/path/to/b.xlsx" tsx scripts/seed-warn-data.ts
 * Files can also be passed via WARN_FILES env (comma-separated paths).
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseCSVFromString, parseExcelFromBuffer } from '../utils/parseFile';
import { ingestWarnFile } from '../utils/warn';
import { getDataDirectory, ensureDataDirectory, safeWriteFile } from '../utils/dataDirectory';

function getFilePaths(): string[] {
  const env = process.env.WARN_FILES;
  if (env) {
    return env.split(',').map((p) => p.trim()).filter(Boolean);
  }
  return process.argv.slice(2).filter((p) => p && !p.startsWith('-'));
}

function parseFileAt(filePath: string): { headers: string[]; rows: Record<string, string | number>[] } {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath);
  const baseName = path.basename(filePath);

  if (ext === '.csv') {
    const text = content.toString('utf-8');
    const parsed = parseCSVFromString(text);
    return { headers: parsed.headers, rows: parsed.rows };
  }
  if (['.xlsx', '.xls', '.xlsm'].includes(ext)) {
    const buf = content instanceof Buffer ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) : content;
    const parsed = parseExcelFromBuffer(buf);
    return { headers: parsed.headers, rows: parsed.rows };
  }
  throw new Error(`Unsupported extension: ${ext}. Use .csv or .xlsx`);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function main() {
  const filePaths = getFilePaths();
  if (filePaths.length === 0) {
    console.log('Usage: tsx scripts/seed-warn-data.ts <file1> [file2] ...');
    console.log('   or: WARN_FILES="/path/a.csv,/path/b.xlsx" tsx scripts/seed-warn-data.ts');
    process.exit(1);
  }

  ensureDataDirectory();
  const dataDir = getDataDirectory();
  const warnDir = path.join(dataDir, 'warn');
  if (!fs.existsSync(warnDir)) {
    fs.mkdirSync(warnDir, { recursive: true });
  }

  const allRows: ReturnType<typeof ingestWarnFile>['rows'] = [];
  const meta: { ingestedAt: string; fileCount: number; fileNames: string[] } = {
    ingestedAt: new Date().toISOString(),
    fileCount: filePaths.length,
    fileNames: [],
  };

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.warn(`Skip (not found): ${filePath}`);
      continue;
    }
    const baseName = path.basename(filePath);
    meta.fileNames.push(baseName);
    try {
      const { headers, rows } = parseFileAt(filePath);
      const data = { headers, rows, rowCount: rows.length, columnCount: headers.length };
      const result = ingestWarnFile(data, baseName);
      if (result.warnings.length) {
        console.warn(`  ${baseName}: ${result.warnings.join('; ')}`);
      }
      console.log(`  ${baseName}: ${result.rows.length} rows (profile: ${result.profileId ?? 'generic'})`);
      allRows.push(...result.rows);
    } catch (err) {
      console.error(`  ${baseName}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const timestamp = Date.now();
  const id = shortId();
  const filename = `warn_${timestamp}_${id}.json`;
  const outPath = path.join(warnDir, filename);
  const payload = { rows: allRows, meta };
  safeWriteFile(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${allRows.length} rows to ${outPath}`);
}

main();
