/**
 * Normalized WARN row schema — single shape for all ingested WARN data.
 */

import { z } from 'zod';

export const normalizedWarnRowSchema = z.object({
  companyName: z.string(),
  city: z.string(),
  stateOrCounty: z.string(),
  layoffCount: z.number(),
  layoffDate: z.string().nullable(),
  noticeDate: z.string().nullable(),
  sourceFile: z.string(),
  sourceState: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export type NormalizedWarnRow = z.infer<typeof normalizedWarnRowSchema>;

export function validateNormalizedWarnRow(row: unknown): NormalizedWarnRow {
  return normalizedWarnRowSchema.parse(row);
}

export function isNormalizedWarnRow(row: unknown): row is NormalizedWarnRow {
  return normalizedWarnRowSchema.safeParse(row).success;
}
