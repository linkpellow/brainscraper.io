'use client';

import { useState } from 'react';
import { Instagram, Search, Loader2, Users, Hash, MapPin, UserPlus } from 'lucide-react';
import type { LeadListItem, SourceDetails } from '@/types/leadList';

interface InstagramUser {
  username: string;
  full_name?: string;
  pk?: string;
  city_name?: string;
}

interface InstagramLeadGeneratorProps {
  onAddLeads?: (leads: LeadListItem[]) => void;
  /** Pass existing Instagram profile URLs to avoid re-adding the same users to the shared list. */
  existingInstagramUrls?: string[];
}

function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export default function InstagramLeadGenerator({ onAddLeads, existingInstagramUrls }: InstagramLeadGeneratorProps) {
  const [keyword, setKeyword] = useState('health insurance');
  const [hashtag, setHashtag] = useState('healthinsurance');
  const [mode, setMode] = useState<'keyword' | 'hashtag'>('keyword');
  const [users, setUsers] = useState<InstagramUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchByKeyword = async () => {
    const q = keyword.trim() || 'health insurance';
    setLoading(true);
    setError(null);
    setUsers([]);
    try {
      const res = await fetch('/api/instagram-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search_users', query: q }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Search failed');
      const raw = json.data?.users ?? json.data?.data?.users ?? [];
      type UserShape = { username?: string; full_name?: string; pk?: string };
      const list: InstagramUser[] = raw.map((u: { user?: UserShape } & UserShape) => {
        const user = (u.user ?? u) as UserShape;
        return {
          username: user.username ?? '',
          full_name: user.full_name,
          pk: user.pk,
        };
      }).filter((u: InstagramUser) => u.username);
      setUsers(list);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const loadByHashtag = async () => {
    const tag = hashtag.replace(/^#/, '').trim() || 'healthinsurance';
    setLoading(true);
    setError(null);
    setUsers([]);
    try {
      const res = await fetch('/api/instagram-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tag_feeds', hashtag: tag }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Hashtag feed failed');
      const items = json.data?.data?.items ?? json.data?.items ?? json.data?.edges ?? [];
      const postUrls: string[] = [];
      const seen = new Set<string>();
      for (const item of items.slice(0, 15)) {
        const shortcode = item.node?.shortcode ?? item.shortcode ?? item.code;
        const url = item.node?.url ?? item.url;
        if (url && !seen.has(url)) {
          postUrls.push(url);
          seen.add(url);
        } else if (shortcode && !seen.has(shortcode)) {
          postUrls.push(`https://www.instagram.com/p/${shortcode}/`);
          seen.add(shortcode);
        }
      }
      const collected: InstagramUser[] = [];
      for (const url of postUrls.slice(0, 8)) {
        const postRes = await fetch('/api/instagram-discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'post_info', url }),
        });
        const postJson = await postRes.json();
        if (!postRes.ok || !postJson.success) continue;
        const d = postJson.data?.data ?? postJson.data;
        const owner = d?.owner;
        if (owner?.username && !collected.some(u => u.username === owner.username)) {
          collected.push({
            username: owner.username,
            full_name: owner.full_name,
            pk: owner.id ?? owner.pk,
          });
        }
        const commentEdges = d?.edge_media_to_parent_comment?.edges ?? d?.comments?.edges ?? [];
        for (const edge of commentEdges.slice(0, 20)) {
          const node = edge.node ?? edge;
          const commentOwner = node.owner ?? node.user;
          const un = commentOwner?.username;
          if (un && !collected.some(u => u.username === un)) {
            collected.push({ username: un });
          }
        }
      }
      setUsers(collected);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hashtag load failed');
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    if (users.length === 0) return;
    setLoadingLocations(true);
    setError(null);
    try {
      const updated = await Promise.all(users.map(async (u) => {
        try {
          const res = await fetch('/api/instagram-discovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'user_info', username: u.username }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) return u;
          const d = json.data?.data ?? json.data;
          return {
            ...u,
            full_name: d.full_name ?? u.full_name,
            city_name: d.city_name ?? u.city_name,
          };
        } catch {
          return u;
        }
      }));
      setUsers(updated);
    } finally {
      setLoadingLocations(false);
    }
  };

  const addToLeadList = () => {
    if (users.length === 0) {
      alert('No users to add');
      return;
    }
    const existingSet = existingInstagramUrls?.length ? new Set(existingInstagramUrls.map(u => u.toLowerCase().replace(/\/$/, ''))) : null;
    const sourceStr = mode === 'keyword'
      ? `Instagram - keyword: ${keyword.trim() || 'health insurance'}`
      : `Instagram - #${hashtag.replace(/^#/, '').trim() || 'healthinsurance'}`;
    const leads: LeadListItem[] = users.map((u, idx) => {
      const name = u.full_name?.trim() || u.username;
      const nameParts = name.split(' ');
      const url = instagramProfileUrl(u.username);
      const sourceDetails: SourceDetails = {
        username: u.username,
        hashtag: mode === 'hashtag' ? hashtag.replace(/^#/, '') : undefined,
        keywords: mode === 'keyword' ? [keyword.trim() || 'health insurance'] : undefined,
      };
      return {
        id: `ig-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        firstName: nameParts[0] ?? '',
        lastName: nameParts.slice(1).join(' ') ?? '',
        location: u.city_name ?? undefined,
        city: u.city_name,
        instagramUrl: url,
        addedAt: new Date().toISOString(),
        source: sourceStr,
        platform: 'instagram',
        sourceDetails,
        enriched: false,
        dncChecked: false,
      };
    });
    const newLeads = existingSet
      ? leads.filter(l => l.instagramUrl && !existingSet.has(l.instagramUrl.toLowerCase().replace(/\/$/, '')))
      : leads;
    const skipped = leads.length - newLeads.length;
    if (onAddLeads) {
      onAddLeads(newLeads);
      if (skipped > 0) {
        alert(`Added ${newLeads.length} Instagram leads (${skipped} already in list)`);
      } else {
        alert(`Added ${newLeads.length} Instagram leads to pipeline`);
      }
    }
  };

  const clearResults = () => {
    setUsers([]);
    setError(null);
    setHasSearched(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 font-data">
        Find people interested in health insurance: search by keyword or load commenters from hashtag posts. Add to the shared lead list for enrichment.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('keyword')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === 'keyword' ? 'bg-white/20 text-white border border-white/40' : 'bg-white/5 text-slate-400 border border-white/10 hover:border-white/20'}`}
        >
          <Search className="w-3.5 h-3.5 inline mr-1.5" />
          Keyword
        </button>
        <button
          type="button"
          onClick={() => setMode('hashtag')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === 'hashtag' ? 'bg-white/20 text-white border border-white/40' : 'bg-white/5 text-slate-400 border border-white/10 hover:border-white/20'}`}
        >
          <Hash className="w-3.5 h-3.5 inline mr-1.5" />
          Hashtag
        </button>
      </div>
      {mode === 'keyword' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="e.g. health insurance"
            className="input-minimal flex-1 min-w-[180px]"
          />
          <button
            type="button"
            onClick={searchByKeyword}
            disabled={loading}
            className="btn-inactive px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search users
          </button>
        </div>
      )}
      {mode === 'hashtag' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={hashtag}
            onChange={e => setHashtag(e.target.value)}
            placeholder="e.g. healthinsurance"
            className="input-minimal flex-1 min-w-[180px]"
          />
          <button
            type="button"
            onClick={loadByHashtag}
            disabled={loading}
            className="btn-inactive px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
            Load posts & commenters
          </button>
        </div>
      )}
      {error && (
        <div className="px-4 py-3 bg-red-900/20 border border-red-500/50 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {hasSearched && !loading && users.length === 0 && (
        <p className="text-sm text-slate-400">No users found. Try a different keyword or hashtag.</p>
      )}
      {users.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-300">{users.length} users</span>
            <button
              type="button"
              onClick={fetchLocations}
              disabled={loadingLocations}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-slate-300 hover:bg-white/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              {loadingLocations ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
              Fetch name & city
            </button>
            <button
              type="button"
              onClick={addToLeadList}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/20 text-white hover:bg-white/30 flex items-center gap-1.5"
            >
              <UserPlus className="w-3 h-3" />
              Add to Lead List
            </button>
            <button
              type="button"
              onClick={clearResults}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/10"
            >
              Clear results
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-1 text-sm text-slate-300">
            {users.slice(0, 50).map(u => {
              const url = instagramProfileUrl(u.username);
              return (
                <li key={u.username} className="flex items-center gap-2">
                  <Instagram className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-200 hover:text-white hover:underline truncate"
                  >
                    {u.full_name || u.username}
                  </a>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-slate-300 truncate"
                  >
                    @{u.username}
                  </a>
                  {u.city_name && <span className="text-slate-400 text-xs shrink-0">• {u.city_name}</span>}
                </li>
              );
            })}
            {users.length > 50 && <li className="text-slate-500 text-xs">+{users.length - 50} more</li>}
          </ul>
        </>
      )}
    </div>
  );
}
