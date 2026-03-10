/**
 * Ingest parsed WARN file into normalized rows. No I/O — pure transformation.
 */

import type { ParsedData } from '../parseFile';
import type { NormalizedWarnRow } from './normalizedSchema';
import { resolveColumnMap, mapRow } from './columnMapper';

export interface IngestWarnResult {
  rows: NormalizedWarnRow[];
  warnings: string[];
  profileId: string | null;
}

/** Infer source state from filename heuristics (e.g. michigan, texas, FL_TN). */
function inferSourceState(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.includes('texas') || lower.includes('tx')) return 'TX';
  if (lower.includes('michigan') || lower.includes('mi')) return 'MI';
  if (lower.includes('florida') || lower.includes('_fl_') || lower.includes('fl_')) return 'FL';
  if (lower.includes('tennessee') || lower.includes('_tn') || lower.includes('tn')) return 'TN';
  return undefined;
}

/**
 * Ingest a single parsed file into normalized WARN rows.
 * Rows missing companyName are skipped and a warning is added.
 */
export function ingestWarnFile(
  data: ParsedData,
  sourceFile: string,
  options?: { keepRaw?: boolean }
): IngestWarnResult {
  const warnings: string[] = [];
  const { headers, rows: rawRows } = data;
  if (!headers?.length) {
    return { rows: [], warnings: ['No headers in file'], profileId: null };
  }
  const { map: columnMap, profileId } = resolveColumnMap(headers);
  const sourceState = inferSourceState(sourceFile);
  const keepRaw = options?.keepRaw ?? false;

  const rows: NormalizedWarnRow[] = [];
  let skipped = 0;
  for (let i = 0; i < rawRows.length; i++) {
    const normalized = mapRow(
      rawRows[i],
      columnMap,
      sourceFile,
      sourceState,
      keepRaw
    );
    if (normalized) {
      rows.push(normalized);
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) missing company name.`);
  }
  if (!columnMap.companyName) {
    warnings.push('No company/employer column detected; no rows produced.');
  }
  return { rows, warnings, profileId };
}
