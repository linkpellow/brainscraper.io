import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Send CrokDocs page as MMS via Telnyx
 * Based on: https://developers.telnyx.com/docs/messaging/messages/send-receive-mms
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, test = false } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;
    const TELNYX_INBOUND_NUMBERS = process.env.TELNYX_INBOUND_NUMBERS || '+19704520286,+19312408316,+19302121198,+18542222011,+18043920691,+16564001490,+16415483076,+15678031629,+14432478537,+14352740149';
    const TELNYX_MEDIA_REGION = process.env.TELNYX_MEDIA_REGION || 'us-east';

    if (!TELNYX_API_KEY) {
      return NextResponse.json(
        { error: 'TELNYX_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Parse all available numbers
    const availableNumbers = TELNYX_INBOUND_NUMBERS.split(',').map(n => n.trim()).filter(n => n);

    // Format phone number to E.164
    let cleanedPhone = phone.replace(/[^\d+]/g, '');
    if (!cleanedPhone.startsWith('+')) {
      if (cleanedPhone.startsWith('1') && cleanedPhone.length === 11) {
        cleanedPhone = '+' + cleanedPhone;
      } else if (cleanedPhone.length === 10) {
        cleanedPhone = '+1' + cleanedPhone;
      }
    }

    // Get base URL for screenshot
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'http://localhost:3000';
    const crokdocsUrl = `${baseUrl}/crokdocs`;

    // Use htmlcsstoimage.com API for screenshot (no browser needed)
    const HTMLCSSTOIMAGE_API_KEY = process.env.HTMLCSSTOIMAGE_API_KEY;
    const HTMLCSSTOIMAGE_USER_ID = process.env.HTMLCSSTOIMAGE_USER_ID;
    
    let screenshotPath: string;
    let imageBuffer: Buffer;
    
    if (HTMLCSSTOIMAGE_API_KEY && HTMLCSSTOIMAGE_USER_ID) {
      // Use htmlcsstoimage.com API
      console.log(`[CROKDOCS_MMS] Using htmlcsstoimage.com API for screenshot`);
      const response = await fetch('https://hcti.io/v1/image', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${HTMLCSSTOIMAGE_USER_ID}:${HTMLCSSTOIMAGE_API_KEY}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: crokdocsUrl,
          viewport_width: 1200,
          viewport_height: 1600,
          device_scale_factor: 2,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Screenshot API error: ${response.statusText}`);
      }
      
      const result = await response.json();
      const imageUrl = result.url;
      
      // Download the image
      const imageResponse = await fetch(imageUrl);
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    } else {
      // Fallback: Try playwright if available
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1200, height: 1600 });
        await page.goto(crokdocsUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        const tempDir = os.tmpdir();
        screenshotPath = path.join(tempDir, `crokdocs-${Date.now()}.png`);
        await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true,
          type: 'png',
        });
        await browser.close();
        imageBuffer = fs.readFileSync(screenshotPath);
        fs.unlinkSync(screenshotPath);
        
        // Check image size - MMS typically has 1MB limit
        const imageSizeMB = imageBuffer.length / (1024 * 1024);
        console.log(`[CROKDOCS_MMS] Image size: ${imageSizeMB.toFixed(2)} MB`);
        
        if (imageSizeMB > 1) {
          console.warn(`[CROKDOCS_MMS] ⚠️ Image is ${imageSizeMB.toFixed(2)} MB, may exceed MMS size limits (1MB)`);
          // Note: Could add image compression here if needed
        }
      } catch (playwrightError) {
        throw new Error('Screenshot service not available. Please set HTMLCSSTOIMAGE_API_KEY and HTMLCSSTOIMAGE_USER_ID, or install playwright');
      }
    }

      // imageBuffer is already set above

      // Upload to a public URL (using a simple approach - in production, use S3 or similar)
      // For testing, we'll use Telnyx's media upload endpoint or send as base64
      // According to Telnyx docs, we can send MMS with media_urls

      // First, upload the media to Telnyx or a public URL
      // For simplicity, we'll use a data URL approach or upload to a public service
      // Actually, Telnyx requires a publicly accessible URL for media_urls
      
      // Alternative: Use a service like imgur or upload to a public bucket
      // For now, let's try using Telnyx's media upload if available, or use a public image host
      
      // Since we need a public URL, let's save to a public directory or use a service
      // For Railway/production, we could save to /public/temp/ and serve it
      // For now, let's use a workaround: save to public directory if it exists
      
      const publicDir = path.join(process.cwd(), 'public', 'temp');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      
      const publicFileName = `crokdocs-${Date.now()}.png`;
      const publicPath = path.join(publicDir, publicFileName);
      fs.writeFileSync(publicPath, imageBuffer);
      
      // Construct public URL - use API route for serving images
      const mediaUrl = `${baseUrl}/temp/${publicFileName}`;
      
      // Verify the URL is accessible from external perspective (like Telnyx would see it)
      console.log(`[CROKDOCS_MMS] Verifying media URL is publicly accessible: ${mediaUrl}`);
      let mediaUrlAccessible = false;
      try {
        // Test without authentication headers (simulating Telnyx's fetch)
        const urlCheck = await fetch(mediaUrl, { 
          method: 'HEAD',
          // Explicitly don't send cookies/auth headers
          credentials: 'omit',
        });
        if (urlCheck.ok) {
          mediaUrlAccessible = true;
          console.log(`[CROKDOCS_MMS] ✅ Media URL is publicly accessible (${urlCheck.status})`);
        } else {
          console.warn(`[CROKDOCS_MMS] ⚠️ Media URL returned ${urlCheck.status} - may cause MMS to fail`);
          console.warn(`[CROKDOCS_MMS] ⚠️ Response headers:`, Object.fromEntries(urlCheck.headers.entries()));
        }
      } catch (urlError) {
        console.warn(`[CROKDOCS_MMS] ⚠️ Could not verify media URL: ${urlError}`);
      }
      
      if (!mediaUrlAccessible) {
        console.error(`[CROKDOCS_MMS] ❌ Media URL is NOT publicly accessible - MMS will FAIL!`);
        console.error(`[CROKDOCS_MMS] ❌ Telnyx cannot fetch images from protected routes. Ensure /temp/ is excluded from authentication.`);
      }

      // Try each number until one works
      let lastError: any = null;
      let successResult: any = null;
      let successfulNumber: string | null = null;

      console.log(`[CROKDOCS_MMS] Attempting to send MMS to ${cleanedPhone} with ${availableNumbers.length} available numbers`);

      for (const fromNumber of availableNumbers) {
        try {
          console.log(`[CROKDOCS_MMS] Trying number: ${fromNumber}`);
          
          const requestBody: any = {
            from: fromNumber,
            to: cleanedPhone,
            text: test ? '🧪 Test: CrokDocs Daily Report' : '📊 CrokDocs Daily Report',
            media_urls: [mediaUrl],
          };

          // Add messaging profile if available
          if (TELNYX_MESSAGING_PROFILE_ID) {
            requestBody.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;
          }

          // Note: media_region is not a valid field in v2/messages API
          // It's a messaging profile configuration, not a request parameter

          const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${TELNYX_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          if (telnyxResponse.ok) {
            const result = await telnyxResponse.json();
            successResult = result;
            successfulNumber = fromNumber;
            console.log(`[CROKDOCS_MMS] ✅ Success with number ${fromNumber}: ${result.data?.id}`);
            console.log(`[CROKDOCS_MMS] Response:`, JSON.stringify(result, null, 2));
            break; // Success! Exit loop
          } else {
            const errorText = await telnyxResponse.text();
            lastError = { status: telnyxResponse.status, statusText: telnyxResponse.statusText, details: errorText };
            console.log(`[CROKDOCS_MMS] ❌ Failed with ${fromNumber}: ${telnyxResponse.status} ${telnyxResponse.statusText}`);
            console.log(`[CROKDOCS_MMS] Error details:`, errorText);
            // Continue to next number - don't break, try all numbers
          }
        } catch (error) {
          lastError = error;
          console.log(`[CROKDOCS_MMS] ❌ Exception with ${fromNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Continue to next number
        }
      }

      if (!successResult) {
        // All numbers failed
        console.error('[CROKDOCS_MMS] All numbers failed. Last error:', lastError);
        return NextResponse.json(
          { 
            error: 'Failed to send MMS with all available numbers', 
            lastError,
            triedNumbers: availableNumbers,
          },
          { status: 500 }
        );
      }

      const result = successResult;
      
      // Clean up public file after a delay (or use a cron job)
      setTimeout(() => {
        try {
          if (fs.existsSync(publicPath)) {
            fs.unlinkSync(publicPath);
          }
        } catch (e) {
          console.error('[CROKDOCS_MMS] Error cleaning up file:', e);
        }
      }, 3600000); // Delete after 1 hour

      return NextResponse.json({
        success: true,
        message: 'MMS sent successfully',
        messageId: result.data?.id,
        fromNumber: successfulNumber,
        mediaUrl,
        triedNumbers: availableNumbers.length,
      });
  } catch (error) {
    console.error('[CROKDOCS_MMS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
