import { NextRequest, NextResponse } from 'next/server';

const RAPIDAPI_HOST = 'facebook-scraper-api4.p.rapidapi.com';

function getKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY not configured');
  return key;
}

async function searchPosts(query: string, endCursor?: string): Promise<unknown> {
  const params = new URLSearchParams({ query });
  if (endCursor) params.set('end_cursor', endCursor);
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/fetch_search_posts?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 && text.includes('not subscribed')) {
      throw new Error(
        'Facebook Scraper API: subscription required. In RapidAPI, open "Facebook Scraper API 4" (facebook-scraper-api4.p.rapidapi.com), subscribe to a plan, and ensure RAPIDAPI_KEY in .env.local matches that app\'s key.'
      );
    }
    throw new Error(`Search posts: ${res.status} ${text}`);
  }
  return res.json();
}

async function getPostComments(link?: string, postId?: string, endCursor?: string): Promise<unknown> {
  const params = new URLSearchParams();
  if (link) params.set('link', link);
  else if (postId) params.set('post_id', postId);
  else throw new Error('link or post_id required');
  if (endCursor) params.set('end_cursor', endCursor);
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/get_facebook_post_comments_details?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`Post comments: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getPageDetails(link: string): Promise<unknown> {
  const params = new URLSearchParams({ link });
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/get_facebook_pages_details_from_link?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`Page details: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return Array.isArray(json) ? json[0] : json;
}

async function searchAdsKeywords(query: string, country?: string): Promise<unknown> {
  const params = new URLSearchParams({ query });
  if (country && country !== 'ALL') params.set('country', country);
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/fetch_search_ads_keywords?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`Search ads keywords: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchSearchAdsPages(query: string, endCursor?: string, country?: string): Promise<unknown> {
  const params = new URLSearchParams({ query });
  if (endCursor) params.set('end_cursor', endCursor);
  if (country && country !== 'ALL') params.set('country', country);
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/fetch_search_ads_pages?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`Search ads pages: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, query, link, post_id, end_cursor, country } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'action is required (search_posts, post_comments, page_details, search_ads_keywords, fetch_search_ads_pages)' }, { status: 400 });
    }

    switch (action) {
      case 'search_posts': {
        const q = typeof query === 'string' ? query : 'coffee';
        const data = await searchPosts(q, end_cursor);
        return NextResponse.json({ success: true, data });
      }
      case 'post_comments': {
        const l = typeof link === 'string' ? link : undefined;
        const pid = typeof post_id === 'string' ? post_id : undefined;
        if (!l && !pid) {
          return NextResponse.json({ error: 'link or post_id required for post_comments' }, { status: 400 });
        }
        const data = await getPostComments(l, pid, end_cursor);
        return NextResponse.json({ success: true, data });
      }
      case 'page_details': {
        const l = typeof link === 'string' ? link : undefined;
        if (!l) return NextResponse.json({ error: 'link required for page_details' }, { status: 400 });
        const data = await getPageDetails(l);
        return NextResponse.json({ success: true, data });
      }
      case 'search_ads_keywords': {
        const q = typeof query === 'string' ? query : '';
        if (!q) return NextResponse.json({ error: 'query required for search_ads_keywords' }, { status: 400 });
        const data = await searchAdsKeywords(q, typeof country === 'string' ? country : undefined);
        return NextResponse.json({ success: true, data });
      }
      case 'fetch_search_ads_pages': {
        const q = typeof query === 'string' ? query : '';
        if (!q) return NextResponse.json({ error: 'query required for fetch_search_ads_pages' }, { status: 400 });
        const data = await fetchSearchAdsPages(q, end_cursor, typeof country === 'string' ? country : undefined);
        return NextResponse.json({ success: true, data });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[FACEBOOK_POSTS]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
