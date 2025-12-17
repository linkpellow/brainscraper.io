import { NextRequest, NextResponse } from 'next/server';

/**
 * Facebook Discovery API endpoint
 * Uses RapidAPI facebook-scraper-api4
 * 
 * Scrapes Facebook group posts and comments for lead discovery
 * API: https://rapidapi.com/oussemaf/api/facebook-scraper-api4
 * 
 * For RapidAPI setup:
 * - target: "server"
 * - client: "fetch"
 */

export interface FacebookDiscoveryRecord {
  fb_post_id?: string;
  fb_comment_id?: string;
  fb_user_id?: string;
  fb_name?: string;
  is_anonymous: boolean;
  raw_message: string;
  extracted_phone: string[];
  detected_keywords: string[];
  created_time?: string;
  group_id: string;
  group_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check cooldown
    try {
      const { isInCooldown } = await import('@/utils/cooldownManager');
      const inCooldown = await isInCooldown();
      if (inCooldown) {
        return NextResponse.json(
          {
            error: 'System is in cooldown',
            message: 'Scraping is temporarily paused due to error spike. Please try again later.',
            isRateLimit: true,
          },
          { status: 503 }
        );
      }
    } catch (cooldownError) {
      console.warn('[FACEBOOK_DISCOVERY] Failed to check cooldown:', cooldownError);
    }

    // Check scrape limits before processing
    try {
      const { checkScrapeLimit } = await import('@/utils/scrapeUsageTracker');
      const { loadSettings } = await import('@/utils/settingsConfig');
      const settings = loadSettings();
      const limitCheck = await checkScrapeLimit(
        'facebook',
        settings.scrapeLimits.facebook.daily,
        settings.scrapeLimits.facebook.monthly
      );

      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            error: 'Scrape limit reached',
            message: `${limitCheck.limitType === 'daily' ? 'Daily' : 'Monthly'} limit reached. Current: ${limitCheck.currentCount}, Limit: ${limitCheck.limit === Infinity ? 'Unlimited' : limitCheck.limit}`,
            limitType: limitCheck.limitType,
            isRateLimit: true,
          },
          { status: 429 }
        );
      }
    } catch (limitError) {
      // If limit check fails, log but continue (backward compatible)
      console.warn('[FACEBOOK_DISCOVERY] Failed to check scrape limits:', limitError);
    }

    const body = await request.json();
    const { groupId, groupUrl, keywords } = body;

    if (!groupId && !groupUrl) {
      return NextResponse.json(
        { error: 'Either groupId or groupUrl is required' },
        { status: 400 }
      );
    }

    // Get API key from environment variables
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Extract group ID from URL if provided
    let finalGroupId = groupId;
    if (groupUrl && !groupId) {
      // Extract ID from URL like: https://www.facebook.com/groups/123456789/
      const match = groupUrl.match(/groups\/(\d+)/);
      if (match) {
        finalGroupId = match[1];
      } else {
        return NextResponse.json(
          { error: 'Invalid group URL format. Expected: https://www.facebook.com/groups/{groupId}/' },
          { status: 400 }
        );
      }
    }

    // Parse keywords (comma-separated string or array)
    const keywordArray = Array.isArray(keywords) 
      ? keywords 
      : typeof keywords === 'string' 
        ? keywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
        : [];

    // Call Facebook Scraper API to get group posts
    // Using get_facebook_group_posts_details_from_id endpoint
    const url = `https://facebook-scraper-api4.p.rapidapi.com/get_facebook_group_posts_details_from_id?group_id=${encodeURIComponent(finalGroupId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'facebook-scraper-api4.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FACEBOOK_DISCOVERY] API error ${response.status}:`, errorText.substring(0, 500));
      return NextResponse.json(
        { 
          success: false,
          error: `RapidAPI error: ${response.statusText}`, 
          details: errorText.substring(0, 1000),
          status: response.status 
        },
        { status: response.status }
      );
    }

    const result = await response.text();
    
    // Try to parse as JSON
    let data: any;
    try {
      data = JSON.parse(result);
    } catch {
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to parse API response as JSON',
          raw: result.substring(0, 1000)
        },
        { status: 500 }
      );
    }

    // Process posts and comments to extract discovery records
    const discoveryRecords: FacebookDiscoveryRecord[] = [];
    
    // Extract phone number regex pattern
    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    
    // Function to extract phones from text
    const extractPhones = (text: string): string[] => {
      const phones: string[] = [];
      const matches = text.matchAll(phoneRegex);
      for (const match of matches) {
        const phone = match[0].replace(/\D/g, '');
        if (phone.length === 10 || phone.length === 11) {
          phones.push(phone);
        }
      }
      return [...new Set(phones)]; // Remove duplicates
    };
    
    // Function to detect keywords in text
    const detectKeywords = (text: string, keywords: string[]): string[] => {
      if (keywords.length === 0) return [];
      const lowerText = text.toLowerCase();
      return keywords.filter(keyword => lowerText.includes(keyword.toLowerCase()));
    };

    // Process posts
    const posts = data.posts || data.data?.posts || (Array.isArray(data) ? data : []);
    
    for (const post of posts) {
      const postMessage = post.message || post.text || post.content || '';
      const postId = post.id || post.post_id || post.fb_post_id;
      const postAuthor = post.from || post.author || {};
      const postAuthorId = postAuthor.id || postAuthor.user_id || post.fb_user_id;
      const postAuthorName = postAuthor.name || post.fb_name || '';
      const isAnonymous = !postAuthorId || postAuthorId === 'anonymous' || postAuthorName === 'Anonymous User';
      const createdTime = post.created_time || post.timestamp || post.date;
      
      // Extract phones and keywords from post
      const extractedPhones = extractPhones(postMessage);
      const detectedKeywords = detectKeywords(postMessage, keywordArray);
      
      // Only include if has keywords or phones (signal detection)
      if (extractedPhones.length > 0 || detectedKeywords.length > 0 || keywordArray.length === 0) {
        discoveryRecords.push({
          fb_post_id: postId,
          fb_user_id: postAuthorId,
          fb_name: postAuthorName,
          is_anonymous: isAnonymous,
          raw_message: postMessage,
          extracted_phone: extractedPhones,
          detected_keywords: detectedKeywords,
          created_time: createdTime,
          group_id: finalGroupId,
        });
      }
      
      // Process comments on this post
      const comments = post.comments || post.comments_data || [];
      for (const comment of comments) {
        const commentMessage = comment.message || comment.text || comment.content || '';
        const commentId = comment.id || comment.comment_id || comment.fb_comment_id;
        const commentAuthor = comment.from || comment.author || {};
        const commentAuthorId = commentAuthor.id || commentAuthor.user_id;
        const commentAuthorName = commentAuthor.name || '';
        const isCommentAnonymous = !commentAuthorId || commentAuthorId === 'anonymous' || commentAuthorName === 'Anonymous User';
        const commentCreatedTime = comment.created_time || comment.timestamp || comment.date;
        
        // Extract phones and keywords from comment
        const commentPhones = extractPhones(commentMessage);
        const commentKeywords = detectKeywords(commentMessage, keywordArray);
        
        // Only include if has keywords or phones
        if (commentPhones.length > 0 || commentKeywords.length > 0 || keywordArray.length === 0) {
          discoveryRecords.push({
            fb_post_id: postId,
            fb_comment_id: commentId,
            fb_user_id: commentAuthorId,
            fb_name: commentAuthorName,
            is_anonymous: isCommentAnonymous,
            raw_message: commentMessage,
            extracted_phone: commentPhones,
            detected_keywords: commentKeywords,
            created_time: commentCreatedTime,
            group_id: finalGroupId,
          });
        }
      }
    }

    // Save records individually (per-record persistence)
    const { saveFacebookDiscoveryRecord, isRecordProcessed } = await import('@/utils/saveFacebookDiscovery');
    let savedCount = 0;
    let skippedCount = 0;
    
    for (const record of discoveryRecords) {
      // Skip if already processed (idempotent)
      if (isRecordProcessed(record)) {
        skippedCount++;
        continue;
      }
      
      // Save record
      if (saveFacebookDiscoveryRecord(record)) {
        savedCount++;
      }
    }

    // Track scrape usage
    try {
      const { incrementScrapeCount } = await import('@/utils/scrapeUsageTracker');
      if (discoveryRecords.length > 0) {
        await incrementScrapeCount('facebook', discoveryRecords.length);
        console.log(`📊 Tracked ${discoveryRecords.length} Facebook discovery records in usage counter`);

        // Check quota and notify if approaching
        try {
          const { loadSettings } = await import('@/utils/settingsConfig');
          const { getDailyUsage, getMonthlyUsage } = await import('@/utils/scrapeUsageTracker');
          const { notifyQuotaApproaching } = await import('@/utils/notifications');
          const settings = loadSettings();
          const daily = await getDailyUsage('facebook');
          const monthly = await getMonthlyUsage('facebook');
          
          if (settings.scrapeLimits.facebook.daily !== Infinity) {
            await notifyQuotaApproaching('facebook', daily, settings.scrapeLimits.facebook.daily, 'daily');
          }
          if (settings.scrapeLimits.facebook.monthly !== Infinity) {
            await notifyQuotaApproaching('facebook', monthly, settings.scrapeLimits.facebook.monthly, 'monthly');
          }
        } catch (quotaError) {
          console.warn('[FACEBOOK_DISCOVERY] Failed to check quota:', quotaError);
        }
      }
    } catch (usageError) {
      // Don't fail the request if usage tracking fails
      console.warn('Failed to track scrape usage:', usageError);
    }

    return NextResponse.json({
      success: true,
      records: discoveryRecords,
      totalRecords: discoveryRecords.length,
      savedCount,
      skippedCount,
      groupId: finalGroupId,
    });
  } catch (error) {
    // Record error for cooldown tracking
    try {
      const { recordError } = await import('@/utils/cooldownManager');
      await recordError();
    } catch (cooldownError) {
      console.warn('[FACEBOOK_DISCOVERY] Failed to record error:', cooldownError);
    }
    console.error('[FACEBOOK_DISCOVERY] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}
