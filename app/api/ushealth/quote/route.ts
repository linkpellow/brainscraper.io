/**
 * USHEALTH Group Quote Automation API
 * 
 * Automates the quote workflow via direct API calls:
 * 1. Get initial form state (VIEWSTATE, etc.)
 * 2. Fetch product data
 * 3. Calculate quote
 * 4. Extract results
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromServer, listSessionsFromServer } from '../../../auth-workers/utils/authWorkerServerStorage';
import * as cheerio from 'cheerio';

interface QuoteRequest {
  zipCode: string | number;
  state: string;
  applicationTypeID?: number; // Optional: if not provided, will try to auto-detect from state
  mktChannelID?: number;
  appDate?: string;
  productSelections?: Record<string, any>;
  autoDetectApplicationType?: boolean; // If true and applicationTypeID not provided, will discover it
}

interface QuoteResponse {
  success: boolean;
  quote?: {
    products: any[];
    coverage: any;
    pricing: any;
    validationMessages: string[];
  };
  error?: string;
  steps: Array<{
    step: string;
    success: boolean;
    details?: any;
    error?: string;
  }>;
}

/**
 * Extract ASP.NET ViewState fields from HTML
 */
function extractViewState(html: string): {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
} | null {
  try {
    const $ = cheerio.load(html);
    
    const viewState = $('input[name="__VIEWSTATE"]').attr('value') || '';
    const viewStateGenerator = $('input[name="__VIEWSTATEGENERATOR"]').attr('value') || '';
    const eventValidation = $('input[name="__EVENTVALIDATION"]').attr('value') || '';
    
    if (!viewState || !viewStateGenerator || !eventValidation) {
      return null;
    }
    
    return {
      viewState,
      viewStateGenerator,
      eventValidation,
    };
  } catch (error) {
    console.error('[USHEALTH Quote] Failed to extract ViewState:', error);
    return null;
  }
}

/**
 * Get session cookies and headers from auth worker
 */
async function getUSHealthSession(): Promise<{
  cookies: string;
  headers: Record<string, string>;
  sessionId: string;
} | null> {
  try {
    // Find USHEALTH session (ezapp.ushealthgroup.com)
    const sessions = listSessionsFromServer();
    const ushealthSession = sessions
      .filter(s => s.targetDomain.includes('ushealthgroup.com') || s.targetDomain.includes('ezapp'))
      .sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];
    
    if (!ushealthSession) {
      console.warn('[USHEALTH Quote] No auth worker session found for ushealthgroup.com');
      return null;
    }
    
    const session = getSessionFromServer(ushealthSession.sessionId);
    if (!session) {
      return null;
    }
    
    // Try to get cookies from HAR data if available
    let cookies: string[] = [];
    
    try {
      // Load HAR data from server storage
      const { getDataDirectory } = await import('@/utils/dataDirectory');
      const { promises: fs } = await import('fs');
      const path = await import('path');
      
      const dataDir = getDataDirectory();
      const harDataPath = path.join(dataDir, 'har-data', `${session.sessionId}.json`);
      
      try {
        const harDataContent = await fs.readFile(harDataPath, 'utf-8');
        const harData = JSON.parse(harDataContent);
        const cookieJar = harData.artifactBundle?.cookieJar?.timeline || [];
        
        // Extract cookies for ushealthgroup.com domain
        for (const cookie of cookieJar) {
          if (cookie.domain.includes('ushealthgroup.com') || cookie.domain.includes('ezapp')) {
            cookies.push(`${cookie.cookieName}=${cookie.value}`);
          }
        }
        
        console.log('[USHEALTH Quote] Loaded cookies from HAR data:', cookies.length);
      } catch (fileError: any) {
        if (fileError.code !== 'ENOENT') {
          console.warn('[USHEALTH Quote] Could not load HAR data:', fileError);
        }
      }
    } catch (harError) {
      console.warn('[USHEALTH Quote] Could not load HAR data, trying extracted vars:', harError);
    }
    
    // Fallback: Extract from extractedVars
    if (cookies.length === 0 && session.step2?.extractedVars) {
      const extractedVars = session.step2.extractedVars;
      
      // Look for session cookies in extracted vars
      Object.keys(extractedVars).forEach(key => {
        if (key.toLowerCase().includes('session') || 
            key.toLowerCase().includes('cookie') ||
            key === 'ASP.NET_SessionId' ||
            key === 'ASP_NET_SessionId') {
          const value = extractedVars[key];
          if (value && typeof value === 'string' && value.length > 0) {
            // Normalize cookie name
            const cookieName = key.replace(/_/g, '.');
            cookies.push(`${cookieName}=${value}`);
          }
        }
      });
    }
    
    // Build headers
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
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
    console.error('[USHEALTH Quote] Failed to get session:', error);
    return null;
  }
}

/**
 * Step 1: Get initial form state
 */
async function getInitialFormState(
  session: { cookies: string; headers: Record<string, string> }
): Promise<{
  success: boolean;
  viewState?: { viewState: string; viewStateGenerator: string; eventValidation: string };
  html?: string;
  error?: string;
}> {
  try {
    const response = await fetch('https://ezapp.ushealthgroup.com/QuickQuoteMobile.aspx', {
      method: 'GET',
      headers: {
        ...session.headers,
        'Referer': 'https://ezapp.ushealthgroup.com/',
      },
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const html = await response.text();
    const viewState = extractViewState(html);
    
    // Update cookies from response (critical for ASP.NET session)
    const setCookieHeaders = response.headers.getSetCookie();
    if (setCookieHeaders.length > 0) {
      const existingCookies = session.cookies ? session.cookies.split('; ').filter(c => c.trim()) : [];
      const newCookies = setCookieHeaders.map(c => {
        const cookiePair = c.split(';')[0].trim();
        return cookiePair;
      });
      
      // Merge cookies, keeping existing and adding new
      const allCookies = [...existingCookies];
      for (const newCookie of newCookies) {
        const [name] = newCookie.split('=');
        // Remove old cookie with same name if exists
        const index = allCookies.findIndex(c => c.startsWith(name + '='));
        if (index >= 0) {
          allCookies[index] = newCookie;
        } else {
          allCookies.push(newCookie);
        }
      }
      
      session.cookies = allCookies.join('; ');
      session.headers['Cookie'] = session.cookies;
      
      console.log('[USHEALTH Quote] Updated cookies from response:', {
        cookieCount: allCookies.length,
        hasASPNETSession: allCookies.some(c => c.includes('ASP.NET_SessionId')),
      });
    }
    
    if (!viewState) {
      return {
        success: false,
        error: 'Failed to extract ViewState from initial page',
        html,
      };
    }
    
    return {
      success: true,
      viewState,
      html,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Step 2: Fetch product data
 */
async function fetchProductData(
  session: { cookies: string; headers: Record<string, string> },
  params: {
    applicationTypeID?: number;
    zipCode: string | number;
    state: string;
    mktChannelID?: number;
    appDate?: string;
  }
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const payload = {
      applicationTypeID: params.applicationTypeID || 25,
      zipCode: params.zipCode,
      state: params.state,
      mktChannelID: params.mktChannelID || 5,
      appDate: params.appDate || new Date().toLocaleDateString('en-US'),
    };
    
    const response = await fetch('https://ezapp.ushealthgroup.com/ezAppMobileWebService.asmx/GetDataSetString', {
      method: 'POST',
      headers: {
        ...session.headers,
        'Content-Type': 'application/json',
        'Referer': 'https://ezapp.ushealthgroup.com/QuickQuoteMobile.aspx',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Step 3: Calculate quote
 */
async function calculateQuote(
  session: { cookies: string; headers: Record<string, string> },
  viewState: { viewState: string; viewStateGenerator: string; eventValidation: string },
  productSelections: Record<string, any> = {}
): Promise<{
  success: boolean;
  html?: string;
  quoteData?: any;
  error?: string;
}> {
  try {
    // Build form data
    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState.viewState);
    formData.append('__VIEWSTATEGENERATOR', viewState.viewStateGenerator);
    formData.append('__EVENTVALIDATION', viewState.eventValidation);
    formData.append('__EVENTTARGET', 'btnCalculate');
    formData.append('__EVENTARGUMENT', '');
    
    // Add product selections
    Object.entries(productSelections).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    
    const response = await fetch('https://ezapp.ushealthgroup.com/QuickQuoteMobile.aspx', {
      method: 'POST',
      headers: {
        ...session.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://ezapp.ushealthgroup.com/QuickQuoteMobile.aspx',
        'Origin': 'https://ezapp.ushealthgroup.com',
      },
      body: formData.toString(),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const html = await response.text();
    
    // Update cookies from response
    const setCookieHeaders = response.headers.getSetCookie();
    if (setCookieHeaders.length > 0) {
      const existingCookies = session.cookies ? session.cookies.split('; ').filter(c => c.trim()) : [];
      const newCookies = setCookieHeaders.map(c => {
        const cookiePair = c.split(';')[0].trim();
        return cookiePair;
      });
      
      const allCookies = [...existingCookies];
      for (const newCookie of newCookies) {
        const [name] = newCookie.split('=');
        const index = allCookies.findIndex(c => c.startsWith(name + '='));
        if (index >= 0) {
          allCookies[index] = newCookie;
        } else {
          allCookies.push(newCookie);
        }
      }
      
      session.cookies = allCookies.join('; ');
      session.headers['Cookie'] = session.cookies;
    }
    
    // Extract updated ViewState (for potential follow-up requests)
    const updatedViewState = extractViewState(html);
    
    // Parse quote results from UpdatePanel fragments
    const $ = cheerio.load(html);
    const quoteData: any = {
      products: [],
      coverage: {},
      pricing: {},
      validationMessages: [],
      rawHtml: html.substring(0, 5000), // First 5KB for debugging
      updatedViewState: updatedViewState || null,
    };
    
    // Extract from updateProduct panel
    const updateProduct = $('#updateProduct').html() || $('#updateProduct').text();
    if (updateProduct) {
      quoteData.products = parseProductPanel(updateProduct);
    }
    
    // Extract from pnlCoverage panel
    const pnlCoverage = $('#pnlCoverage').html() || $('#pnlCoverage').text();
    if (pnlCoverage) {
      quoteData.coverage = parseCoveragePanel(pnlCoverage);
    }
    
    // Extract quote result message
    const quoteMessage = $('#QuoteResultMessage').text().trim() || 
                         $('[id*="QuoteResult"]').text().trim() ||
                         $('[id*="ResultMessage"]').text().trim();
    if (quoteMessage) {
      quoteData.message = quoteMessage;
    }
    
    // Extract validation messages
    const validationMessages: string[] = [];
    $('.validation-error, .error-message, [class*="error"], [class*="Validation"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 0) {
        validationMessages.push(text);
      }
    });
    quoteData.validationMessages = validationMessages;
    
    // Extract pricing information (look for common pricing field patterns)
    const pricing: any = {};
    $('[id*="Price"], [id*="Premium"], [id*="Cost"], [id*="Rate"], [id*="Quote"]').each((_, el) => {
      const id = $(el).attr('id');
      const value = $(el).text().trim() || $(el).attr('value') || $(el).val();
      if (id && value && value.length > 0) {
        pricing[id] = value;
      }
    });
    
    // Also look for pricing in tables
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        if (label && value && (label.toLowerCase().includes('price') || label.toLowerCase().includes('premium') || label.toLowerCase().includes('cost'))) {
          pricing[label] = value;
        }
      }
    });
    
    quoteData.pricing = pricing;
    
    // Extract any visible text that might contain quote information
    const allText = $('body').text();
    if (allText.includes('$') || allText.includes('premium') || allText.includes('quote')) {
      quoteData.hasQuoteData = true;
    }
    
    return {
      success: true,
      html,
      quoteData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parse product panel HTML
 */
function parseProductPanel(html: string): any[] {
  const $ = cheerio.load(html);
  const products: any[] = [];
  
  $('tr, .product-row, [class*="product"]').each((_, el) => {
    const product: any = {};
    $(el).find('td, .product-name, .product-id').each((_, cell) => {
      const text = $(el).text().trim();
      const id = $(cell).attr('id');
      if (text && id) {
        product[id] = text;
      }
    });
    if (Object.keys(product).length > 0) {
      products.push(product);
    }
  });
  
  return products;
}

/**
 * Parse coverage panel HTML
 */
function parseCoveragePanel(html: string): any {
  const $ = cheerio.load(html);
  const coverage: any = {};
  
  $('input, select, [id*="Coverage"], [id*="Limit"]').each((_, el) => {
    const id = $(el).attr('id');
    const value = $(el).val() || $(el).text().trim();
    if (id && value) {
      coverage[id] = value;
    }
  });
  
  return coverage;
}

export async function POST(request: NextRequest) {
  const steps: Array<{ step: string; success: boolean; details?: any; error?: string }> = [];
  
  try {
    const body: QuoteRequest = await request.json();
    const { zipCode, state, applicationTypeID, mktChannelID, appDate, productSelections, autoDetectApplicationType } = body;
    
    // Auto-detect applicationTypeID if not provided and auto-detect is enabled
    let finalApplicationTypeID = applicationTypeID;
    if (!finalApplicationTypeID && autoDetectApplicationType) {
      console.log('[USHEALTH Quote] Auto-detecting applicationTypeID for state:', state);
      // Try to load cached mapping from data directory
      try {
        const { getDataDirectory } = await import('@/utils/dataDirectory');
        const { promises: fs } = await import('fs');
        const path = await import('path');
        
        const dataDir = getDataDirectory();
        const mappingPath = path.join(dataDir, 'ushealth-application-type-mapping.json');
        
        try {
          const mappingContent = await fs.readFile(mappingPath, 'utf-8');
          const mapping = JSON.parse(mappingContent);
          if (mapping[state]) {
            finalApplicationTypeID = mapping[state];
            console.log('[USHEALTH Quote] Found cached mapping:', state, '->', finalApplicationTypeID);
          }
        } catch (fileError: any) {
          if (fileError.code !== 'ENOENT') {
            console.warn('[USHEALTH Quote] Could not load mapping file:', fileError);
          }
        }
      } catch (error) {
        console.warn('[USHEALTH Quote] Could not auto-detect applicationTypeID:', error);
      }
    }
    
    // Step 0: Get session
    const session = await getUSHealthSession();
    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'No auth worker session found for ushealthgroup.com. Please create an auth worker first by uploading a HAR file.',
        steps: [{
          step: 'get_session',
          success: false,
          error: 'No session found',
        }],
      }, { status: 401 });
    }
    
    steps.push({
      step: 'get_session',
      success: true,
      details: { 
        hasCookies: !!session.cookies,
        cookieCount: session.cookies.split(';').filter(c => c.trim()).length,
        sessionId: session.sessionId,
      },
    });
    
    // Step 1: Get initial form state
    const formStateResult = await getInitialFormState(session);
    steps.push({
      step: 'get_initial_form_state',
      success: formStateResult.success,
      details: formStateResult.viewState ? { hasViewState: true } : undefined,
      error: formStateResult.error,
    });
    
    if (!formStateResult.success || !formStateResult.viewState) {
      return NextResponse.json({
        success: false,
        error: formStateResult.error || 'Failed to get initial form state',
        steps,
      }, { status: 500 });
    }
    
    // Step 2: Fetch product data
    const productDataResult = await fetchProductData(session, {
      applicationTypeID: finalApplicationTypeID,
      zipCode,
      state,
      mktChannelID,
      appDate,
    });
    
    steps.push({
      step: 'fetch_product_data',
      success: productDataResult.success,
      details: productDataResult.data ? { hasData: true } : undefined,
      error: productDataResult.error,
    });
    
    if (!productDataResult.success) {
      return NextResponse.json({
        success: false,
        error: productDataResult.error || 'Failed to fetch product data',
        steps,
      }, { status: 500 });
    }
    
    // Step 3: Calculate quote
    // Use updated ViewState from product data response if available, otherwise use initial
    let viewStateToUse = formStateResult.viewState;
    
    // If product data response included HTML with ViewState, extract it
    if (productDataResult.data && typeof productDataResult.data === 'string') {
      const updated = extractViewState(productDataResult.data);
      if (updated) {
        viewStateToUse = updated;
        console.log('[USHEALTH Quote] Using ViewState from product data response');
      }
    }
    
    const quoteResult = await calculateQuote(session, viewStateToUse, productSelections);
    
    steps.push({
      step: 'calculate_quote',
      success: quoteResult.success,
      details: quoteResult.quoteData ? { 
        hasQuoteData: true,
        hasProducts: (quoteResult.quoteData.products?.length || 0) > 0,
        hasPricing: Object.keys(quoteResult.quoteData.pricing || {}).length > 0,
        validationCount: quoteResult.quoteData.validationMessages?.length || 0,
      } : undefined,
      error: quoteResult.error,
    });
    
    if (!quoteResult.success) {
      return NextResponse.json({
        success: false,
        error: quoteResult.error || 'Failed to calculate quote',
        steps,
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      quote: quoteResult.quoteData,
      steps,
      sessionInfo: {
        sessionId: session.sessionId,
        cookieCount: session.cookies.split(';').filter(c => c.trim()).length,
      },
    });
    
  } catch (error) {
    console.error('[USHEALTH Quote] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      steps,
    }, { status: 500 });
  }
}
