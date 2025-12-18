import { NextRequest, NextResponse } from 'next/server';
import { getUshaToken, clearTokenCache } from '@/utils/getUshaToken';

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
    
    // Get JWT token automatically (Cognito → OAuth → env var)
    let token: string;
    try {
      token = await getUshaToken();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Token fetch failed';
      console.error(`❌ [DNC SCRUB] USHA JWT token fetch failed: ${errorMsg}`);
      return NextResponse.json(
        { 
          success: false,
          error: `Failed to obtain valid USHA token. ${errorMsg}` 
        },
        { status: 500 }
      );
    }
    
    if (!token) {
      console.error('❌ [DNC SCRUB] USHA JWT token is null/undefined');
      return NextResponse.json(
        { 
          success: false,
          error: 'USHA JWT token is required. Token fetch returned null.' 
        },
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
          // Clean phone number - remove all non-digits and ensure it's a string
          const cleanedPhone = String(phone || '').replace(/\D/g, '');
          
          // Validate phone number length (10 digits minimum for US numbers)
          if (!cleanedPhone || cleanedPhone.length < 10) {
            console.log(`  ⚠️  [DNC SCRUB] Invalid phone: ${phone} (cleaned: ${cleanedPhone}, too short)`);
            return {
              phone: cleanedPhone || String(phone || '').substring(0, 10),
              isDNC: false,
              status: 'INVALID',
              error: 'Invalid phone number format (must be at least 10 digits)'
            };
          }
          
          // Handle 11-digit numbers (with country code 1) - strip leading 1
          const normalizedPhone = cleanedPhone.length === 11 && cleanedPhone.startsWith('1') 
            ? cleanedPhone.substring(1) 
            : cleanedPhone;

          // Build USHA API URL (use normalized phone)
          const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(currentContextAgentNumber)}&phone=${encodeURIComponent(normalizedPhone)}`;

          const headers = {
            'Authorization': `Bearer ${token}`,
            'Origin': 'https://agent.ushadvisors.com',
            'Referer': 'https://agent.ushadvisors.com',
            'Content-Type': 'application/json',
          };

          const requestStart = Date.now();
          let response = await fetch(url, {
            method: 'GET',
            headers,
          });

          // Retry once on auth failure (should be rare with backend validation)
          if (response.status === 401 || response.status === 403) {
            console.log(`  🔄 [DNC SCRUB] ${normalizedPhone}: Token expired (${response.status}), refreshing and retrying...`);
            clearTokenCache();
            const freshToken = await getUshaToken(null, true);
            if (freshToken) {
              response = await fetch(url, {
                method: 'GET',
                headers: { ...headers, 'Authorization': `Bearer ${freshToken}` },
              });
            }
          }

          const requestTime = Date.now() - requestStart;

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error response');
            console.log(`  ❌ [DNC SCRUB] ${normalizedPhone}: ERROR (${response.status}) - ${response.statusText}`);
            return {
              phone: normalizedPhone,
              isDNC: false,
              status: 'ERROR',
              error: `USHA API error: ${response.status} ${response.statusText}`
            };
          }

          let result;
          try {
            result = await response.json();
          } catch (parseError) {
            console.log(`  ❌ [DNC SCRUB] ${normalizedPhone}: Failed to parse JSON response`);
            return {
              phone: normalizedPhone,
              isDNC: false,
              status: 'ERROR',
              error: 'Invalid JSON response from USHA API'
            };
          }
          
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
          
          console.log(`  ${statusIcon} [DNC SCRUB] ${normalizedPhone}: ${status}${reason ? ` (${reason})` : ''} (${requestTime}ms)`);
          
          return {
            phone: normalizedPhone,
            isDNC: isDNC,
            status: status,
            reason: reason,
          };
        } catch (error) {
          const originalPhone = String(phone || '');
          const fallbackPhone = originalPhone.replace(/\D/g, '').substring(0, 10) || 'unknown';
          console.log(`  ❌ [DNC SCRUB] ${originalPhone}: EXCEPTION - ${error instanceof Error ? error.message : 'Unknown error'}`);
          return {
            phone: fallbackPhone,
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
