/**
 * USHEALTH Application Type ID Mapper
 * 
 * Discovers which applicationTypeID corresponds to which state
 * by testing API calls with different state/zip combinations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromServer, listSessionsFromServer } from '../../../auth-workers/utils/authWorkerServerStorage';

interface StateZip {
  state: string;
  stateName: string;
  zipCodes: string[];
}

// Common zip codes for each state (major cities)
const STATE_ZIP_MAP: StateZip[] = [
  { state: 'AL', stateName: 'Alabama', zipCodes: ['35203', '36104', '36602'] },
  { state: 'AK', stateName: 'Alaska', zipCodes: ['99501', '99701'] },
  { state: 'AZ', stateName: 'Arizona', zipCodes: ['85001', '85701', '85201'] },
  { state: 'AR', stateName: 'Arkansas', zipCodes: ['72201', '72701'] },
  { state: 'CA', stateName: 'California', zipCodes: ['90001', '94102', '95814', '92101'] },
  { state: 'CO', stateName: 'Colorado', zipCodes: ['80201', '80901'] },
  { state: 'CT', stateName: 'Connecticut', zipCodes: ['06101', '06510'] },
  { state: 'DE', stateName: 'Delaware', zipCodes: ['19801', '19901'] },
  { state: 'FL', stateName: 'Florida', zipCodes: ['33101', '33545', '32801', '32202'] },
  { state: 'GA', stateName: 'Georgia', zipCodes: ['30301', '31401'] },
  { state: 'HI', stateName: 'Hawaii', zipCodes: ['96801'] },
  { state: 'ID', stateName: 'Idaho', zipCodes: ['83701', '83201'] },
  { state: 'IL', stateName: 'Illinois', zipCodes: ['60601', '62701', '61601'] },
  { state: 'IN', stateName: 'Indiana', zipCodes: ['46201', '47401'] },
  { state: 'IA', stateName: 'Iowa', zipCodes: ['50301', '52801'] },
  { state: 'KS', stateName: 'Kansas', zipCodes: ['66101', '67201'] },
  { state: 'KY', stateName: 'Kentucky', zipCodes: ['40201', '40501'] },
  { state: 'LA', stateName: 'Louisiana', zipCodes: ['70112', '70801'] },
  { state: 'ME', stateName: 'Maine', zipCodes: ['04101', '04401'] },
  { state: 'MD', stateName: 'Maryland', zipCodes: ['21201', '21401'] },
  { state: 'MA', stateName: 'Massachusetts', zipCodes: ['02101', '01601'] },
  { state: 'MI', stateName: 'Michigan', zipCodes: ['48201', '49501', '48901'] },
  { state: 'MN', stateName: 'Minnesota', zipCodes: ['55401', '55801'] },
  { state: 'MS', stateName: 'Mississippi', zipCodes: ['39201', '39501'] },
  { state: 'MO', stateName: 'Missouri', zipCodes: ['63101', '65801'] },
  { state: 'MT', stateName: 'Montana', zipCodes: ['59101', '59701'] },
  { state: 'NE', stateName: 'Nebraska', zipCodes: ['68101', '68501'] },
  { state: 'NV', stateName: 'Nevada', zipCodes: ['89101', '89501'] },
  { state: 'NH', stateName: 'New Hampshire', zipCodes: ['03101', '03801'] },
  { state: 'NJ', stateName: 'New Jersey', zipCodes: ['07101', '08601'] },
  { state: 'NM', stateName: 'New Mexico', zipCodes: ['87101', '87501'] },
  { state: 'NY', stateName: 'New York', zipCodes: ['10001', '14201', '13201'] },
  { state: 'NC', stateName: 'North Carolina', zipCodes: ['28201', '27601'] },
  { state: 'ND', stateName: 'North Dakota', zipCodes: ['58101', '58801'] },
  { state: 'OH', stateName: 'Ohio', zipCodes: ['44101', '45201', '43201'] },
  { state: 'OK', stateName: 'Oklahoma', zipCodes: ['73101', '74101'] },
  { state: 'OR', stateName: 'Oregon', zipCodes: ['97201', '97401'] },
  { state: 'PA', stateName: 'Pennsylvania', zipCodes: ['19101', '15201', '17101'] },
  { state: 'RI', stateName: 'Rhode Island', zipCodes: ['02901', '02840'] },
  { state: 'SC', stateName: 'South Carolina', zipCodes: ['29201', '29401'] },
  { state: 'SD', stateName: 'South Dakota', zipCodes: ['57101', '57701'] },
  { state: 'TN', stateName: 'Tennessee', zipCodes: ['37201', '38101'] },
  { state: 'TX', stateName: 'Texas', zipCodes: ['75201', '77001', '78701', '79901'] },
  { state: 'UT', stateName: 'Utah', zipCodes: ['84101', '84401'] },
  { state: 'VT', stateName: 'Vermont', zipCodes: ['05401', '05601'] },
  { state: 'VA', stateName: 'Virginia', zipCodes: ['23218', '23501'] },
  { state: 'WA', stateName: 'Washington', zipCodes: ['98101', '99201'] },
  { state: 'WV', stateName: 'West Virginia', zipCodes: ['25301', '26501'] },
  { state: 'WI', stateName: 'Wisconsin', zipCodes: ['53201', '53701'] },
  { state: 'WY', stateName: 'Wyoming', zipCodes: ['82001', '82601'] },
];

/**
 * Get session cookies and headers from auth worker
 */
async function getUSHealthSession(): Promise<{
  cookies: string;
  headers: Record<string, string>;
  sessionId: string;
} | null> {
  try {
    const sessions = listSessionsFromServer();
    const ushealthSession = sessions
      .filter(s => s.targetDomain.includes('ushealthgroup.com') || s.targetDomain.includes('ezapp'))
      .sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];
    
    if (!ushealthSession) {
      return null;
    }
    
    const session = getSessionFromServer(ushealthSession.sessionId);
    if (!session) {
      return null;
    }
    
    let cookies: string[] = [];
    
    // Try to get cookies from HAR data
    try {
      const { getDataDirectory } = await import('@/utils/dataDirectory');
      const { promises: fs } = await import('fs');
      const path = await import('path');
      
      const dataDir = getDataDirectory();
      const harDataPath = path.join(dataDir, 'har-data', `${session.sessionId}.json`);
      
      try {
        const harDataContent = await fs.readFile(harDataPath, 'utf-8');
        const harData = JSON.parse(harDataContent);
        const cookieJar = harData.artifactBundle?.cookieJar?.timeline || [];
        
        for (const cookie of cookieJar) {
          if (cookie.domain.includes('ushealthgroup.com') || cookie.domain.includes('ezapp')) {
            cookies.push(`${cookie.cookieName}=${cookie.value}`);
          }
        }
      } catch (fileError: any) {
        if (fileError.code !== 'ENOENT') {
          console.warn('[AppTypeMapper] Could not load HAR data:', fileError);
        }
      }
    } catch (harError) {
      // Fallback to extracted vars
    }
    
    // Fallback: Extract from extractedVars
    if (cookies.length === 0 && session.step2?.extractedVars) {
      const extractedVars = session.step2.extractedVars;
      Object.keys(extractedVars).forEach(key => {
        if (key.toLowerCase().includes('session') || 
            key.toLowerCase().includes('cookie') ||
            key === 'ASP.NET_SessionId' ||
            key === 'ASP_NET_SessionId') {
          const value = extractedVars[key];
          if (value && typeof value === 'string' && value.length > 0) {
            const cookieName = key.replace(/_/g, '.');
            cookies.push(`${cookieName}=${value}`);
          }
        }
      });
    }
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }
    
    return {
      cookies: cookies.join('; '),
      headers,
      sessionId: session.sessionId,
    };
  } catch (error) {
    console.error('[AppTypeMapper] Failed to get session:', error);
    return null;
  }
}

/**
 * Test a specific applicationTypeID with a state/zip combination
 */
async function testApplicationType(
  session: { cookies: string; headers: Record<string, string> },
  applicationTypeID: number,
  zipCode: string,
  state: string
): Promise<{
  success: boolean;
  hasData: boolean;
  error?: string;
  responseData?: any;
}> {
  try {
    const payload = {
      applicationTypeID,
      zipCode,
      state,
      mktChannelID: 5,
      appDate: new Date().toLocaleDateString('en-US'),
    };
    
    const response = await fetch('https://ezapp.ushealthgroup.com/ezAppMobileWebService.asmx/GetDataSetString', {
      method: 'POST',
      headers: {
        ...session.headers,
        'Referer': 'https://ezapp.ushealthgroup.com/QuickQuoteMobile.aspx',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      return {
        success: false,
        hasData: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    
    // Check if response contains valid product data
    // The response might be a DataSet string or JSON object
    let hasData = false;
    let dataSize = 0;
    
    if (typeof data === 'string') {
      dataSize = data.length;
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(data);
        // Check for DataSet structure (Tables, rows, etc.)
        hasData = parsed && (
          parsed.Tables || 
          parsed.tables || 
          parsed.d || // ASP.NET AJAX response format
          (Array.isArray(parsed) && parsed.length > 0) ||
          (typeof parsed === 'object' && Object.keys(parsed).length > 0 && data.length > 200)
        );
      } catch {
        // Not JSON, check if it's a DataSet XML string
        // Valid responses should have substantial content with table/row structure
        hasData = data.length > 200 && (
          data.includes('Table') || 
          data.includes('Row') || 
          data.includes('DataSet') ||
          data.includes('Product') ||
          data.includes('Plan')
        );
      }
    } else if (typeof data === 'object' && data !== null) {
      dataSize = JSON.stringify(data).length;
      // Check for various response formats
      hasData = !!(
        data.Tables || 
        data.tables || 
        data.d || // ASP.NET AJAX
        data.DataSet ||
        (Array.isArray(data) && data.length > 0) ||
        (Object.keys(data).length > 0 && dataSize > 200)
      );
      
      // Reject error responses
      if (data.error || data.Error || data.message || data.Message) {
        hasData = false;
      }
    }
    
    return {
      success: true,
      hasData,
      responseData: hasData ? (typeof data === 'string' ? data.substring(0, 500) : data) : null, // Only include sample if valid
    };
  } catch (error) {
    return {
      success: false,
      hasData: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Discover applicationTypeID for a state by testing multiple IDs
 * Optimized: Tests IDs 1-35 (30 states + buffer), stops on first successful match per state
 */
async function discoverApplicationTypeForState(
  session: { cookies: string; headers: Record<string, string> },
  state: string,
  zipCodes: string[]
): Promise<{
  applicationTypeID: number | null;
  testedIds: number[];
  successfulTests: Array<{ id: number; zipCode: string; hasData: boolean }>;
}> {
  // Test applicationTypeID values from 1 to 35 (30 licensed states + small buffer)
  const idsToTest = Array.from({ length: 35 }, (_, i) => i + 1);
  const successfulTests: Array<{ id: number; zipCode: string; hasData: boolean }> = [];
  
  // Use first zip code for initial testing (most efficient)
  const primaryZip = zipCodes[0];
  
  // Test each ID with primary zip first
  for (const applicationTypeID of idsToTest) {
    const result = await testApplicationType(session, applicationTypeID, primaryZip, state);
    
    if (result.success && result.hasData) {
      successfulTests.push({
        id: applicationTypeID,
        zipCode: primaryZip,
        hasData: true,
      });
      
      // Found a match! Test with other zip codes to confirm
      for (let i = 1; i < zipCodes.length; i++) {
        const confirmResult = await testApplicationType(session, applicationTypeID, zipCodes[i], state);
        if (confirmResult.success && confirmResult.hasData) {
          successfulTests.push({
            id: applicationTypeID,
            zipCode: zipCodes[i],
            hasData: true,
          });
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // One ID per state - we found it, return early
      return {
        applicationTypeID,
        testedIds: idsToTest.slice(0, idsToTest.indexOf(applicationTypeID) + 1),
        successfulTests,
      };
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // No match found
  return {
    applicationTypeID: null,
    testedIds: idsToTest,
    successfulTests,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { states, maxStates } = body;
    
    // Get session
    const session = await getUSHealthSession();
    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'No auth worker session found for ushealthgroup.com. Please create an auth worker first.',
      }, { status: 401 });
    }
    
    // Determine which states to test
    // Default to the 30 licensed states (from verify-geo-database.ts)
    const LICENSED_STATES = [
      'AL', 'AR', 'CO', 'DE', 'FL', 'GA', 'IL', 'IN', 'IA', 'KS',
      'KY', 'LA', 'MD', 'MI', 'MS', 'MO', 'MT', 'NE', 'NV', 'NC',
      'OH', 'OK', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'WI', 'WV'
    ];
    
    let statesToTest = STATE_ZIP_MAP.filter(s => LICENSED_STATES.includes(s.state));
    
    if (states && Array.isArray(states)) {
      statesToTest = STATE_ZIP_MAP.filter(s => states.includes(s.state));
    }
    
    if (maxStates) {
      statesToTest = statesToTest.slice(0, maxStates);
    }
    
    const results: Array<{
      state: string;
      stateName: string;
      applicationTypeID: number | null;
      testedIds: number[];
      successfulTests: Array<{ id: number; zipCode: string; hasData: boolean }>;
      error?: string;
    }> = [];
    
    // Test each state
    for (const stateInfo of statesToTest) {
      console.log(`[AppTypeMapper] Testing state: ${stateInfo.state} (${stateInfo.stateName})`);
      
      try {
        const discovery = await discoverApplicationTypeForState(
          session,
          stateInfo.state,
          stateInfo.zipCodes
        );
        
        results.push({
          state: stateInfo.state,
          stateName: stateInfo.stateName,
          ...discovery,
        });
        
        console.log(`[AppTypeMapper] ${stateInfo.state}: applicationTypeID = ${discovery.applicationTypeID}`);
      } catch (error) {
        results.push({
          state: stateInfo.state,
          stateName: stateInfo.stateName,
          applicationTypeID: null,
          testedIds: [],
          successfulTests: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      
      // Delay between states to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Build mapping
    const mapping: Record<string, number> = {};
    results.forEach(r => {
      if (r.applicationTypeID !== null) {
        mapping[r.state] = r.applicationTypeID;
      }
    });
    
    return NextResponse.json({
      success: true,
      mapping,
      results,
      summary: {
        totalStates: results.length,
        mappedStates: Object.keys(mapping).length,
        unmappedStates: results.filter(r => r.applicationTypeID === null).map(r => r.state),
      },
    });
    
  } catch (error) {
    console.error('[AppTypeMapper] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET endpoint to retrieve cached mapping or start discovery
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'status';
  
  if (action === 'status') {
    // Return status and instructions
    return NextResponse.json({
      success: true,
      message: 'Use POST to discover applicationTypeID mappings',
      endpoint: '/api/ushealth/application-type-mapper',
      method: 'POST',
      body: {
        states: ['FL', 'TX', 'CA'], // Optional: specific states to test
        maxStates: 10, // Optional: limit number of states to test
      },
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Invalid action',
  }, { status: 400 });
}
