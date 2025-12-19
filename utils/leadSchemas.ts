/**
 * Zod Schemas for Lead Data Validation
 * 
 * Formal schema validation for all lead data structures
 * Ensures data integrity at runtime
 */

import { z } from 'zod';

/**
 * Source Details Schema
 */
export const SourceDetailsSchema = z.object({
  occupation: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  isSelfEmployed: z.boolean().optional(),
  changedJobs: z.boolean().optional(),
  companySize: z.string().optional(),
  groupName: z.string().optional(),
  groupId: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  postId: z.string().optional(),
  commentId: z.string().optional(),
}).passthrough();

/**
 * Lead Summary Schema
 * 
 * CRITICAL: Phone is required (10+ digits)
 * Name is required (non-empty)
 */
export const LeadSummarySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().refine(
    (phone) => {
      const digits = phone.replace(/\D/g, '');
      return digits.length >= 10;
    },
    { message: 'Phone must have at least 10 digits' }
  ),
  dobOrAge: z.string().optional(),
  zipcode: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  email: z.string().optional(),
  dncStatus: z.enum(['YES', 'NO', 'UNKNOWN']).optional(),
  dncLastChecked: z.string().optional(),
  canContact: z.boolean().optional(),
  dncReason: z.string().optional(),
  income: z.number().optional(),
  lineType: z.string().optional(),
  carrier: z.string().optional(),
  normalizedCarrier: z.string().optional(),
  searchFilter: z.string().optional(),
  dateScraped: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  platform: z.enum(['linkedin', 'facebook']).optional(),
  sourceDetails: SourceDetailsSchema.optional(),
}).strict();

/**
 * Enriched Row Schema (partial - for validation)
 */
export const EnrichedRowSchema = z.object({
  Name: z.string().optional(),
  'First Name': z.string().optional(),
  'Last Name': z.string().optional(),
  Phone: z.string().optional(),
  Email: z.string().optional(),
  City: z.string().optional(),
  State: z.string().optional(),
  Zipcode: z.string().optional(),
  'LinkedIn URL': z.string().optional(),
  _enriched: z.any().optional(),
}).passthrough();

/**
 * Validate LeadSummary with Zod
 * Returns validated data or throws error
 */
export function validateLeadSummary(data: unknown): z.infer<typeof LeadSummarySchema> {
  return LeadSummarySchema.parse(data);
}

/**
 * Safe validate LeadSummary - returns result instead of throwing
 */
export function safeValidateLeadSummary(data: unknown): {
  success: boolean;
  data?: z.infer<typeof LeadSummarySchema>;
  error?: z.ZodError;
} {
  const result = LeadSummarySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate array of LeadSummary
 */
export function validateLeadSummaryArray(data: unknown[]): z.infer<typeof LeadSummarySchema>[] {
  return z.array(LeadSummarySchema).parse(data);
}

/**
 * Safe validate array of LeadSummary
 */
export function safeValidateLeadSummaryArray(data: unknown[]): {
  success: boolean;
  data?: z.infer<typeof LeadSummarySchema>[];
  errors?: z.ZodError[];
} {
  const results: z.infer<typeof LeadSummarySchema>[] = [];
  const errors: z.ZodError[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const result = LeadSummarySchema.safeParse(data[i]);
    if (result.success) {
      results.push(result.data);
    } else {
      errors.push(result.error);
    }
  }
  
  if (errors.length === 0) {
    return { success: true, data: results };
  }
  
  return { success: false, errors };
}
