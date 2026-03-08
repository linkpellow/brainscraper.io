import { NextRequest, NextResponse } from 'next/server';

const RAPIDAPI_HOST = 'instagram-looter2.p.rapidapi.com';

function getKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY not configured');
  return key;
}

async function searchUsers(query: string): Promise<unknown> {
  const params = new URLSearchParams({ query, select: 'users' });
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/search?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`Search users: ${res.status} ${await res.text()}`);
  return res.json();
}

async function tagFeeds(hashtag: string, endCursor?: string): Promise<unknown> {
  const params = new URLSearchParams({ query: hashtag.replace(/^#/, '') });
  if (endCursor) params.set('end_cursor', endCursor);
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/tag-feeds?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`Tag feeds: ${res.status} ${await res.text()}`);
  return res.json();
}

async function postInfo(url: string): Promise<unknown> {
  const params = new URLSearchParams({ url });
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/post?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`Post info: ${res.status} ${await res.text()}`);
  return res.json();
}

async function userInfo(username: string): Promise<unknown> {
  const params = new URLSearchParams({ username });
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/profile2?${params}`,
    {
      headers: {
        'x-rapidapi-key': getKey(),
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    }
  );
  if (!res.ok) throw new Error(`User info: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, query, url, username, hashtag, end_cursor } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { error: 'action is required (search_users, tag_feeds, post_info, user_info)' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'search_users': {
        const q = typeof query === 'string' ? query : '';
        if (!q) return NextResponse.json({ error: 'query required for search_users' }, { status: 400 });
        const data = await searchUsers(q);
        return NextResponse.json({ success: true, data });
      }
      case 'tag_feeds': {
        const tag = typeof hashtag === 'string' ? hashtag : typeof query === 'string' ? query : '';
        if (!tag) return NextResponse.json({ error: 'hashtag or query required for tag_feeds' }, { status: 400 });
        const data = await tagFeeds(tag, typeof end_cursor === 'string' ? end_cursor : undefined);
        return NextResponse.json({ success: true, data });
      }
      case 'post_info': {
        const u = typeof url === 'string' ? url : '';
        if (!u) return NextResponse.json({ error: 'url required for post_info' }, { status: 400 });
        const data = await postInfo(u);
        return NextResponse.json({ success: true, data });
      }
      case 'user_info': {
        const un = typeof username === 'string' ? username : '';
        if (!un) return NextResponse.json({ error: 'username required for user_info' }, { status: 400 });
        const data = await userInfo(un);
        return NextResponse.json({ success: true, data });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[INSTAGRAM_DISCOVERY]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
