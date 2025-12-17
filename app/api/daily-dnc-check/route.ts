import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getUshaToken } from '@/utils/getUshaToken';
import { getDataDirectory, getDataFilePath, safeWriteFile, safeReadFile, ensureDataDirectory } from '@/utils/dataDirectory';
import { withLock } from '@/utils/fileLock';

/**
 * Daily DNC Check Cron Job
 * 
 * Runs daily to check all enriched leads for DNC status updates
 * 
 * This endpoint:
 * 1. Loads all enriched leads from storage
 * 2. Checks DNC status for each lead with a phone number
 * 3. Updates leads with new DNC status
 * 4. Saves updated leads back to storage
 * 
 * Schedule: Daily at 6:00 AM UTC (configured in vercel.json)
 */

interface LeadSummary {
  name?: string;
  phone?: string;
  email?: string;
  dncStatus?: string;
  dncReason?: string;
  canContact?: boolean;
  dncLastChecked?: string; // ISO date string of last DNC check
  [key: string]: any;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🌅 [DAILY_DNC] ============================================');
  console.log('🌅 [DAILY_DNC] Daily DNC Check Job Started');
  console.log('🌅 [DAILY_DNC] ============================================\n');
  
  // Verify this is a cron job request (optional security check)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('⚠️ [DAILY_DNC] Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Step 1: Load all enriched leads
    console.log('📂 [DAILY_DNC] Step 1: Loading enriched leads...');
    const leads = await loadAllEnrichedLeads();
    console.log(`✅ [DAILY_DNC] Loaded ${leads.length} enriched leads\n`);
    
    if (leads.length === 0) {
      console.log('⚠️ [DAILY_DNC] No enriched leads found, skipping DNC check');
      return NextResponse.json({
        success: true,
        message: 'No enriched leads found',
        checked: 0,
        updated: 0,
      });
    }
    
    // Step 2: Filter leads with phone numbers that haven't been checked today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const leadsWithPhone = leads.filter((lead: LeadSummary) => {
      const phone = lead.phone?.replace(/\D/g, '');
      if (!phone || phone.length < 10) {
        return false;
      }
      
      // Skip if already checked today
      if (lead.dncLastChecked) {
        const lastCheckedDate = lead.dncLastChecked.split('T')[0];
        if (lastCheckedDate === today) {
          return false; // Already checked today, skip
        }
      }
      
      return true;
    });
    
    const skippedToday = leads.filter((lead: LeadSummary) => {
      const phone = lead.phone?.replace(/\D/g, '');
      if (!phone || phone.length < 10) return false;
      if (lead.dncLastChecked) {
        const lastCheckedDate = lead.dncLastChecked.split('T')[0];
        return lastCheckedDate === today;
      }
      return false;
    }).length;
    
    console.log(`📞 [DAILY_DNC] Step 2: Found ${leadsWithPhone.length} leads with phone numbers that need checking`);
    console.log(`⏭️  [DAILY_DNC] Skipping ${skippedToday} leads already checked today\n`);
    
    if (leadsWithPhone.length === 0) {
      console.log('⚠️ [DAILY_DNC] No leads with phone numbers found');
      return NextResponse.json({
        success: true,
        message: 'No leads with phone numbers found',
        checked: 0,
        updated: 0,
      });
    }
    
    // Step 3: Get USHA token
    console.log('🔑 [DAILY_DNC] Step 3: Getting USHA authentication token...');
    const token = await getUshaToken();
    if (!token) {
      throw new Error('Failed to get USHA authentication token');
    }
    console.log('✅ [DAILY_DNC] Token obtained\n');
    
    // Step 4: Check DNC status for all leads (in batches)
    console.log('🔍 [DAILY_DNC] Step 4: Checking DNC status...');
    const batchSize = 10;
    const totalBatches = Math.ceil(leadsWithPhone.length / batchSize);
    let checked = 0;
    let updated = 0;
    const updatedLeads: Map<string, LeadSummary> = new Map();
    
    const currentContextAgentNumber = '00044447';
    
    for (let i = 0; i < leadsWithPhone.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = leadsWithPhone.slice(i, i + batchSize);
      
      console.log(`📦 [DAILY_DNC] Processing batch ${batchNum}/${totalBatches} (${batch.length} leads)...`);
      
      const batchPromises = batch.map(async (lead: LeadSummary) => {
        try {
          const phone = lead.phone?.replace(/\D/g, '') || '';
          if (phone.length < 10) {
            return { lead, updated: false };
          }
          
          const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(phone)}`;
          
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Origin': 'https://agent.ushadvisors.com',
              'Referer': 'https://agent.ushadvisors.com',
              'Content-Type': 'application/json',
            },
          });
          
          if (!response.ok) {
            console.log(`  ⚠️ [DAILY_DNC] ${phone}: API error ${response.status}`);
            return { lead, updated: false };
          }
          
          const result = await response.json();
          const responseData = result.data || result;
          const isDNC = responseData.isDoNotCall === true || 
                       responseData.contactStatus?.canContact === false ||
                       result.isDNC === true || 
                       result.isDoNotCall === true;
          const canContact = responseData.contactStatus?.canContact !== false && !isDNC;
          const reason = responseData.contactStatus?.reason || responseData.reason || (isDNC ? 'Do Not Call' : undefined);
          
          // Check if DNC status changed
          const currentDNCStatus = lead.dncStatus || 'UNKNOWN';
          const newDNCStatus = isDNC ? 'YES' : 'NO';
          const statusChanged = currentDNCStatus !== newDNCStatus;
          
          // Always update dncLastChecked date, even if status didn't change
          // This ensures we track that the lead was checked today
          const updatedLead: LeadSummary = {
            ...lead,
            dncStatus: newDNCStatus,
            dncReason: reason,
            canContact: canContact,
            dncLastChecked: new Date().toISOString(), // Mark as checked today
          };
          
          // Use phone as key for deduplication
          updatedLeads.set(phone, updatedLead);
          
          // Return updated: true if status changed or was missing, false if just date updated
          return { lead: updatedLead, updated: statusChanged || !lead.dncStatus };
        } catch (error) {
          console.log(`  ❌ [DAILY_DNC] ${lead.phone}: Error - ${error instanceof Error ? error.message : 'Unknown'}`);
          return { lead, updated: false };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      checked += batchResults.length;
      updated += batchResults.filter(r => r.updated).length;
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < leadsWithPhone.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`\n✅ [DAILY_DNC] DNC check complete: ${checked} checked, ${updated} updated\n`);
    
    // Step 5: Update leads with new DNC status
    if (updatedLeads.size > 0) {
      console.log('💾 [DAILY_DNC] Step 5: Updating leads with new DNC status...');
      
      // Create a map of all leads by phone for quick lookup
      const leadsMap = new Map<string, LeadSummary>();
      leads.forEach((lead: LeadSummary) => {
        const phone = lead.phone?.replace(/\D/g, '');
        if (phone && phone.length >= 10) {
          leadsMap.set(phone, lead);
        }
      });
      
      // Update leads with new DNC status
      updatedLeads.forEach((updatedLead, phone) => {
        const existingLead = leadsMap.get(phone);
        if (existingLead) {
          Object.assign(existingLead, updatedLead);
        }
      });
      
      // Save updated leads back to storage
      await saveEnrichedLeads(leads);
      console.log(`✅ [DAILY_DNC] Saved ${leads.length} updated leads\n`);
    } else {
      console.log('ℹ️ [DAILY_DNC] No DNC status changes detected, no update needed\n');
    }
    
    const totalTime = Date.now() - startTime;
    const dncCount = Array.from(updatedLeads.values()).filter(l => l.dncStatus === 'YES').length;
    const okCount = Array.from(updatedLeads.values()).filter(l => l.dncStatus === 'NO').length;
    
    console.log('🌅 [DAILY_DNC] ============================================');
    console.log(`🌅 [DAILY_DNC] Daily DNC Check Complete!`);
    console.log(`🌅 [DAILY_DNC] Total leads: ${leads.length}`);
    console.log(`🌅 [DAILY_DNC] Leads with phone: ${leadsWithPhone.length}`);
    console.log(`🌅 [DAILY_DNC] Checked: ${checked}`);
    console.log(`🌅 [DAILY_DNC] Updated: ${updated}`);
    console.log(`🌅 [DAILY_DNC] DNC: ${dncCount} | OK: ${okCount}`);
    console.log(`🌅 [DAILY_DNC] Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log('🌅 [DAILY_DNC] ============================================\n');
    
    return NextResponse.json({
      success: true,
      message: 'Daily DNC check completed',
      totalLeads: leads.length,
      leadsWithPhone: leadsWithPhone.length,
      checked,
      updated,
      dncCount,
      okCount,
      duration: `${(totalTime / 1000).toFixed(2)}s`,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('❌ [DAILY_DNC] ============================================');
    console.error('❌ [DAILY_DNC] Fatal Error:', error);
    console.error(`❌ [DAILY_DNC] Time before error: ${totalTime}ms`);
    console.error('❌ [DAILY_DNC] ============================================\n');
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * Load all enriched leads from storage files
 * Single source of truth: enriched-all-leads.json
 */
async function loadAllEnrichedLeads(): Promise<LeadSummary[]> {
  ensureDataDirectory();
  const filePath = getDataFilePath('enriched-all-leads.json');
  const content = safeReadFile(filePath);
  
  if (content) {
    try {
      const data = JSON.parse(content);
      const leads = Array.isArray(data) ? data : (data.leads || []);
      
      if (leads.length > 0) {
        console.log(`✅ [DAILY_DNC] Loaded ${leads.length} leads from enriched-all-leads.json`);
        return leads;
      }
    } catch (error) {
      console.error(`❌ [DAILY_DNC] Error parsing enriched-all-leads.json:`, error);
    }
  }
  
  return [];
}

/**
 * Save enriched leads back to storage with file locking
 */
async function saveEnrichedLeads(leads: LeadSummary[]): Promise<void> {
  ensureDataDirectory();
  
  const primaryPath = getDataFilePath('enriched-all-leads.json');
  
  // Use file locking to prevent concurrent writes
  await withLock(primaryPath, async () => {
    try {
      // Save to enriched-all-leads.json (primary storage)
      safeWriteFile(primaryPath, JSON.stringify(leads, null, 2));
      console.log(`✅ [DAILY_DNC] Saved ${leads.length} leads to ${primaryPath}`);
      
      // Also update timestamp file to indicate last DNC check
      const timestampPath = getDataFilePath('last-dnc-check.json');
      const timestampData = {
        lastCheck: new Date().toISOString(),
        totalLeads: leads.length,
        leadsWithPhone: leads.filter(l => {
          const phoneDigits = l.phone?.replace(/\D/g, '');
          return phoneDigits && phoneDigits.length >= 10;
        }).length,
      };
      safeWriteFile(timestampPath, JSON.stringify(timestampData, null, 2));
      console.log(`✅ [DAILY_DNC] Updated timestamp: ${timestampData.lastCheck}`);
    } catch (error) {
      console.error('❌ [DAILY_DNC] Failed to save enriched leads:', error);
      throw error; // Re-throw to be caught by main handler
    }
  });
}
