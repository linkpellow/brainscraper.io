/**
 * Lead List Types
 * 
 * Data structure for accumulating leads before enrichment
 */

export interface SourceDetails {
  // LinkedIn fields
  occupation?: string;
  jobTitle?: string;
  location?: string;
  isSelfEmployed?: boolean;
  changedJobs?: boolean;
  companySize?: string;
  // Facebook fields
  groupName?: string;
  groupId?: string;
  keywords?: string[];
  postId?: string;
  commentId?: string;
}

export interface LeadListItem {
  // Unique ID for this lead
  id: string;
  
  // Basic info (from LinkedIn scrape or Facebook discovery)
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  location?: string;
  linkedinUrl?: string;
  
  // Contact info (empty pre-enrichment, filled post-enrichment)
  phone?: string;
  email?: string;
  
  // Address info (empty pre-enrichment, filled post-enrichment)
  city?: string;
  state?: string;
  zipCode?: string;
  
  // Demographic info (empty pre-enrichment, filled post-enrichment)
  dateOfBirth?: string;
  age?: number;
  income?: string;
  
  // DNC status (empty pre-enrichment, filled after DNC scrub)
  dncStatus?: 'Safe' | 'Do Not Call' | 'Unknown';
  dncReason?: string;
  canContact?: boolean;
  
  // Metadata
  addedAt: string; // ISO timestamp when added to list
  source: string; // Which search added this lead (backward compatibility)
  enriched: boolean; // Has this lead been enriched?
  dncChecked: boolean; // Has this lead been DNC checked?
  platform?: 'linkedin' | 'facebook'; // Platform source identifier
  sourceDetails?: SourceDetails; // Structured source information
}

export interface LeadList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  leads: LeadListItem[];
  totalLeads: number;
  enrichedCount: number;
  dncCheckedCount: number;
}

