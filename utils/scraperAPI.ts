/**
 * ScraperAPI Utility with Capsolver Integration
 * 
 * Handles web scraping with automatic captcha solving via Capsolver
 */

// Ensure Node.js types are available
declare const process: {
  env: {
    SCRAPERAPI_API_KEY?: string;
    CAPSOLVER_API_KEY?: string;
    [key: string]: string | undefined;
  };
};

interface ScraperAPIResponse {
  html?: string;
  error?: string;
  statusCode?: number;
  usedCapsolver?: boolean;
}

interface CapsolverTaskResponse {
  taskId: string;
  errorId?: number;
  errorCode?: string;
  errorDescription?: string;
}

interface CapsolverResultResponse {
  status: string;
  solution?: {
    token?: string;
    gRecaptchaResponse?: string;
    userAgent?: string;
  };
  errorId?: number;
  errorCode?: string;
  errorDescription?: string;
}

/**
 * Solve reCAPTCHA v2 using Capsolver
 */
async function solveRecaptchaV2(
  siteUrl: string,
  siteKey: string
): Promise<{ token?: string; error?: string }> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  
  if (!apiKey) {
    return { error: 'CAPSOLVER_API_KEY not configured' };
  }

  try {
    // Create task
    const createTaskResponse = await fetch('https://api.capsolver.com/createTask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: 'ReCaptchaV2TaskProxyLess',
          websiteURL: siteUrl,
          websiteKey: siteKey,
        },
      }),
    });

    if (!createTaskResponse.ok) {
      return { error: `Capsolver createTask failed: ${createTaskResponse.statusText}` };
    }

    const taskData: CapsolverTaskResponse = await createTaskResponse.json();
    
    if (taskData.errorId || taskData.errorCode) {
      return { 
        error: `Capsolver error: ${taskData.errorDescription || taskData.errorCode}` 
      };
    }

    if (!taskData.taskId) {
      return { error: 'Capsolver did not return taskId' };
    }

    // Poll for result (max 2 minutes)
    const maxAttempts = 120; // 2 minutes with 1 second intervals
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const getResultResponse = await fetch('https://api.capsolver.com/getTaskResult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientKey: apiKey,
          taskId: taskData.taskId,
        }),
      });

      if (!getResultResponse.ok) {
        continue; // Retry
      }

      const resultData: CapsolverResultResponse = await getResultResponse.json();

      if (resultData.status === 'ready' && resultData.solution) {
        return { token: resultData.solution.gRecaptchaResponse || resultData.solution.token };
      }

      if (resultData.status === 'processing') {
        continue; // Keep polling
      }

      if (resultData.errorId || resultData.errorCode) {
        return { 
          error: `Capsolver error: ${resultData.errorDescription || resultData.errorCode}` 
        };
      }
    }

    return { error: 'Capsolver timeout: Task did not complete in time' };
  } catch (error) {
    return { 
      error: `Capsolver error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Detect if HTML contains a captcha challenge
 */
function hasCaptcha(html: string): { hasCaptcha: boolean; siteKey?: string; type?: string } {
  // Skip captcha detection for error pages (404, 500, etc.)
  if (html.includes('<title>404 Error</title>') || 
      html.includes('<title>500 Error</title>') ||
      html.includes('Request failed')) {
    return { hasCaptcha: false };
  }
  
  // Check for reCAPTCHA v2 (most common)
  const recaptchaV2Match = html.match(/data-sitekey=["']([^"']+)["']/i);
  if (recaptchaV2Match) {
    console.log(`[ScraperAPI] reCAPTCHA v2 detected with siteKey: ${recaptchaV2Match[1].substring(0, 20)}...`);
    return { hasCaptcha: true, siteKey: recaptchaV2Match[1], type: 'recaptcha_v2' };
  }

  // Check for reCAPTCHA in script tags
  const recaptchaScriptMatch = html.match(/recaptcha.*sitekey["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (recaptchaScriptMatch) {
    console.log(`[ScraperAPI] reCAPTCHA v2 detected in script with siteKey: ${recaptchaScriptMatch[1].substring(0, 20)}...`);
    return { hasCaptcha: true, siteKey: recaptchaScriptMatch[1], type: 'recaptcha_v2' };
  }

  // Check for hCaptcha
  const hcaptchaMatch = html.match(/data-sitekey=["']([^"']+)["'].*hcaptcha/i);
  if (hcaptchaMatch) {
    console.log(`[ScraperAPI] hCaptcha detected with siteKey: ${hcaptchaMatch[1].substring(0, 20)}...`);
    return { hasCaptcha: true, siteKey: hcaptchaMatch[1], type: 'hcaptcha' };
  }

  // Check for visible captcha challenge (more specific patterns)
  const visibleCaptchaPatterns = [
    /g-recaptcha/i,
    /recaptcha.*challenge/i,
    /verify.*you.*are.*human/i,
    /i.*am.*not.*a.*robot/i,
  ];
  
  const hasVisibleCaptcha = visibleCaptchaPatterns.some(pattern => pattern.test(html));
  
  if (hasVisibleCaptcha) {
    console.log(`[ScraperAPI] Captcha keywords detected but no siteKey found - may be a false positive`);
    // Return hasCaptcha: true but no type/siteKey so Capsolver won't be called
    // This is intentional - we need a siteKey to solve
    return { hasCaptcha: true };
  }
  
  return { hasCaptcha: false };
}

/**
 * Scrape URL using ScraperAPI with Capsolver fallback for captchas
 */
export async function scrapeWithScraperAPI(
  url: string,
  options: {
    render?: boolean;
    countryCode?: string;
    premium?: boolean;
    ultraPremium?: boolean;
  } = {}
): Promise<ScraperAPIResponse> {
  const apiKey = process.env.SCRAPERAPI_API_KEY;
  
  if (!apiKey) {
    return { error: 'SCRAPERAPI_API_KEY not configured' };
  }

  try {
    // Build ScraperAPI URL
    const params = new URLSearchParams({
      api_key: apiKey,
      url: url,
    });

    if (options.render) {
      params.append('render', 'true');
    }
    if (options.countryCode) {
      params.append('country_code', options.countryCode);
    }
    // Use ultra_premium if specified (highest success rate), otherwise premium
    if (options.ultraPremium) {
      params.append('ultra_premium', 'true');
    } else if (options.premium) {
      params.append('premium', 'true');
    }

    const scraperApiUrl = `https://api.scraperapi.com?${params.toString()}`;

    console.log(`[ScraperAPI] Requesting: ${url}`);
    console.log(`[ScraperAPI] ScraperAPI URL: ${scraperApiUrl.replace(apiKey, 'REDACTED')}`);

    // First attempt with ScraperAPI
    const response = await fetch(scraperApiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const html = await response.text();
    const statusCode = response.status;
    
    console.log(`[ScraperAPI] Response status: ${statusCode}`);
    console.log(`[ScraperAPI] HTML length: ${html.length} bytes`);
    console.log(`[ScraperAPI] HTML preview (first 500 chars): ${html.substring(0, 500)}`);
    
    // Check for common error indicators
    if (html.includes('Access Denied') || html.includes('403') || html.includes('Forbidden')) {
      console.log(`[ScraperAPI] ⚠️  Access Denied detected in HTML`);
    }
    if (html.includes('blocked') || html.includes('Blocked')) {
      console.log(`[ScraperAPI] ⚠️  Blocked message detected in HTML`);
    }
    if (html.includes('bot') || html.includes('Bot')) {
      console.log(`[ScraperAPI] ⚠️  Bot detection message detected in HTML`);
    }

    // Check if we got a captcha page
    const captchaCheck = hasCaptcha(html);
    console.log(`[ScraperAPI] Captcha check: ${JSON.stringify(captchaCheck)}`);
    
    if (captchaCheck.hasCaptcha && captchaCheck.type === 'recaptcha_v2' && captchaCheck.siteKey) {
      console.log(`[ScraperAPI] ⚠️  reCAPTCHA v2 detected with siteKey, attempting to solve with Capsolver...`);
      console.log(`[ScraperAPI] SiteKey: ${captchaCheck.siteKey.substring(0, 30)}...`);
      
      // Check if Capsolver API key is configured
      if (!process.env.CAPSOLVER_API_KEY) {
        console.error(`[ScraperAPI] ⚠️  CAPSOLVER_API_KEY not configured - cannot solve captcha`);
        return { 
          html, 
          error: 'Captcha detected but CAPSOLVER_API_KEY not configured',
          statusCode 
        };
      }
      
      // Solve captcha
      console.log(`[ScraperAPI] Calling Capsolver to solve reCAPTCHA v2...`);
      const captchaResult = await solveRecaptchaV2(url, captchaCheck.siteKey);
      
      if (captchaResult.error) {
        console.error(`[ScraperAPI] ❌ Capsolver failed: ${captchaResult.error}`);
        return { 
          html, 
          error: `Captcha detected but could not solve: ${captchaResult.error}`,
          statusCode 
        };
      }

      if (!captchaResult.token) {
        console.error(`[ScraperAPI] ❌ Capsolver did not return a token`);
        return { 
          html, 
          error: 'Captcha detected but Capsolver did not return a token',
          statusCode 
        };
      }

      console.log(`[ScraperAPI] ✅ Capsolver solved captcha, token received (length: ${captchaResult.token.length})`);
      
      // Note: ScraperAPI with premium should handle captchas automatically
      // If we still get a captcha page, it means ScraperAPI couldn't bypass it
      // We can't pass the solved token directly to ScraperAPI, but we can retry
      // ScraperAPI might use different proxies/strategies on retry
      console.log(`[ScraperAPI] Retrying request (ScraperAPI should handle captchas with premium)...`);
      
      const retryResponse = await fetch(scraperApiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const retryHtml = await retryResponse.text();
      const retryStatus = retryResponse.status;
      
      console.log(`[ScraperAPI] Retry response status: ${retryStatus}, HTML length: ${retryHtml.length}`);
      
      // Check again for captcha
      const retryCaptchaCheck = hasCaptcha(retryHtml);
      if (!retryCaptchaCheck.hasCaptcha) {
        console.log(`[ScraperAPI] ✅ Successfully bypassed captcha on retry`);
        return { 
          html: retryHtml, 
          statusCode: retryStatus,
          usedCapsolver: true 
        };
      }

      // Still has captcha - ScraperAPI premium should handle this, but if it doesn't,
      // we've at least tried. Return the HTML anyway in case it has useful data.
      console.log(`[ScraperAPI] ⚠️  Captcha still present after retry (ScraperAPI premium should handle this)`);
      return { 
        html: retryHtml, 
        error: 'Captcha still present after solving (ScraperAPI premium should handle this automatically)',
        statusCode: retryStatus,
        usedCapsolver: true 
      };
    } else if (captchaCheck.hasCaptcha) {
      console.log(`[ScraperAPI] ⚠️  Captcha detected but no siteKey found - cannot solve with Capsolver`);
      console.log(`[ScraperAPI] Captcha type: ${captchaCheck.type || 'unknown'}, hasSiteKey: ${!!captchaCheck.siteKey}`);
    }

    // Check for premium plan errors (403 with premium message)
    if (statusCode === 403 && html.includes('premium proxies') && (options.premium || options.ultraPremium)) {
      console.log(`[ScraperAPI] ⚠️  Premium/Ultra Premium not available on current plan, retrying without premium...`);
      
      // Retry without premium
      const retryParams = new URLSearchParams({
        api_key: apiKey,
        url: url,
      });
      
      if (options.render) {
        retryParams.append('render', 'true');
      }
      if (options.countryCode) {
        retryParams.append('country_code', options.countryCode);
      }
      // Don't add premium/ultra_premium on retry
      
      const retryUrl = `https://api.scraperapi.com?${retryParams.toString()}`;
      
      const retryResponse = await fetch(retryUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      const retryHtml = await retryResponse.text();
      const retryStatus = retryResponse.status;
      
      if (retryStatus === 200) {
        console.log(`[ScraperAPI] ✅ Successfully retrieved HTML without premium (${retryHtml.length} bytes)`);
        return { html: retryHtml, statusCode: retryStatus };
      } else {
        console.log(`[ScraperAPI] ❌ Retry without premium also failed: HTTP ${retryStatus}`);
        return { 
          html: retryHtml, 
          error: `ScraperAPI error: HTTP ${retryStatus} (premium not available, regular request also failed)`,
          statusCode: retryStatus 
        };
      }
    }
    
    // Check for other errors
    if (!response.ok && statusCode !== 200) {
      console.log(`[ScraperAPI] ❌ HTTP Error ${statusCode}`);
      console.log(`[ScraperAPI] Error HTML preview: ${html.substring(0, 1000)}`);
      return { 
        html, 
        error: `ScraperAPI error: HTTP ${statusCode}`,
        statusCode 
      };
    }

    // Success
    console.log(`[ScraperAPI] ✅ Successfully retrieved HTML (${html.length} bytes)`);
    return { html, statusCode };
  } catch (error) {
    return { 
      error: `ScraperAPI error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Scrape multiple URLs in sequence
 */
export async function scrapeMultiple(
  urls: string[],
  options: {
    render?: boolean;
    countryCode?: string;
    premium?: boolean;
    ultraPremium?: boolean;
  } = {}
): Promise<Array<ScraperAPIResponse & { url: string }>> {
  const results = [];
  
  for (const url of urls) {
    const result = await scrapeWithScraperAPI(url, options);
    results.push({ ...result, url });
    
    // Small delay between requests to avoid rate limiting
    if (urls.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}
