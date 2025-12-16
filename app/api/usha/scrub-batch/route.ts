import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken } from '@/utils/getUshaToken';

/**
 * USHA Batch Phone Number Scrub API endpoint
 * Checks multiple phone numbers for DNC status in parallel
 * 
 * This endpoint accepts an array of phone numbers and returns DNC status for each
 */

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n🔍 [DNC SCRUB] ============================================');
  console.log('🔍 [DNC SCRUB] Batch DNC Scrubbing Request Received');
  console.log('🔍 [DNC SCRUB] ============================================\n');
  
  try {
    const body = await request.json();
    const { phoneNumbers } = body;
    
    console.log(`📞 [DNC SCRUB] Received ${phoneNumbers?.length || 0} phone numbers to scrub`);
    
    // Get JWT token automatically from Crokodial API (with fallbacks)
    const token = await getUshaToken();
    
    if (!token) {
      console.error('❌ [DNC SCRUB] USHA JWT token fetch failed');
      return NextResponse.json(
        { error: 'USHA JWT token is required. Token fetch failed.' },
        { status: 401 }
      );
    }

    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      console.error('❌ [DNC SCRUB] Invalid phoneNumbers array');
      return NextResponse.json(
        { error: 'phoneNumbers array is required and must not be empty' },
        { status: 400 }
      );
    }

    console.log(`✅ [DNC SCRUB] Token found, starting scrubbing for ${phoneNumbers.length} numbers\n`);

    const currentContextAgentNumber = '00044447';
    const results: Array<{ phone: string; isDNC: boolean; status: string; error?: string }> = [];

    // Process phone numbers in parallel (with rate limiting - max 10 concurrent)
    const batchSize = 10;
    const totalBatches = Math.ceil(phoneNumbers.length / batchSize);
    
    console.log(`📦 [DNC SCRUB] Processing in ${totalBatches} batch(es) of up to ${batchSize} numbers each\n`);
    
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = phoneNumbers.slice(i, i + batchSize);
      
      console.log(`📦 [DNC SCRUB] Batch ${batchNum}/${totalBatches}: Scrubbing ${batch.length} phone numbers...`);
      
      const batchPromises = batch.map(async (phone: string, idx: number) => {
        try {
          // Clean phone number - remove all non-digits
          const cleanedPhone = phone.replace(/\D/g, '');
          
          if (cleanedPhone.length < 10) {
            console.log(`  ⚠️  [DNC SCRUB] Invalid phone: ${phone} (too short)`);
            return {
              phone: cleanedPhone || phone,
              isDNC: false,
              status: 'INVALID',
              error: 'Invalid phone number format'
            };
          }

          // Build USHA API URL
          const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;

          const requestStart = Date.now();
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Origin': 'https://agent.ushadvisors.com',
              'Referer': 'https://agent.ushadvisors.com',
              'Content-Type': 'application/json',
            },
          });

          const requestTime = Date.now() - requestStart;

          if (!response.ok) {
            const errorText = await response.text();
            console.log(`  ❌ [DNC SCRUB] ${cleanedPhone}: ERROR (${response.status}) - ${response.statusText}`);
            return {
              phone: cleanedPhone,
              isDNC: false,
              status: 'ERROR',
              error: `USHA API error: ${response.statusText}`
            };
          }

          const result = await response.json();
          
          // Parse response - check nested data structure first, then fallback to top-level
          const responseData = result.data || result;
          const isDNC = responseData.isDoNotCall === true || 
                       responseData.contactStatus?.canContact === false ||
                       result.isDNC === true || 
                       result.isDoNotCall === true || 
                       result.status === 'DNC' || 
                       result.status === 'Do Not Call';
          
          const status = isDNC ? 'DNC' : 'OK';
          const statusIcon = isDNC ? '🚫' : '✅';
          const reason = responseData.contactStatus?.reason || responseData.reason || (isDNC ? 'Do Not Call' : undefined);
          
          console.log(`  ${statusIcon} [DNC SCRUB] ${cleanedPhone}: ${status}${reason ? ` (${reason})` : ''} (${requestTime}ms)`);
          
          return {
            phone: cleanedPhone,
            isDNC: isDNC,
            status: status,
            reason: reason,
          };
        } catch (error) {
          console.log(`  ❌ [DNC SCRUB] ${phone}: EXCEPTION - ${error instanceof Error ? error.message : 'Unknown error'}`);
          return {
            phone: phone.replace(/\D/g, '') || phone,
            isDNC: false,
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      const dncInBatch = batchResults.filter(r => r.isDNC).length;
      const okInBatch = batchResults.filter(r => r.status === 'OK').length;
      console.log(`  📊 [DNC SCRUB] Batch ${batchNum} complete: ${okInBatch} OK, ${dncInBatch} DNC, ${batchResults.length - okInBatch - dncInBatch} errors\n`);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < phoneNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const totalTime = Date.now() - startTime;
    const dncCount = results.filter(r => r.isDNC).length;
    const okCount = results.filter(r => r.status === 'OK').length;
    const errorCount = results.length - dncCount - okCount;

    console.log('✅ [DNC SCRUB] ============================================');
    console.log(`✅ [DNC SCRUB] Batch Scrubbing Complete!`);
    console.log(`✅ [DNC SCRUB] Total: ${results.length} numbers`);
    console.log(`✅ [DNC SCRUB] OK: ${okCount} | DNC: ${dncCount} | Errors: ${errorCount}`);
    console.log(`✅ [DNC SCRUB] Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log('✅ [DNC SCRUB] ============================================\n');

    return NextResponse.json({
      success: true,
      results: results,
      total: results.length,
      dncCount: dncCount,
      okCount: okCount,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('❌ [DNC SCRUB] ============================================');
    console.error('❌ [DNC SCRUB] Fatal Error:', error);
    console.error(`❌ [DNC SCRUB] Time before error: ${totalTime}ms`);
    console.error('❌ [DNC SCRUB] ============================================\n');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
