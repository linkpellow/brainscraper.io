'use client';

import { useState } from 'react';
import { Facebook, Search, Loader2, Users, MessageSquare, Phone, Hash, MapPin, Link2 } from 'lucide-react';
import type { LeadListItem, SourceDetails } from '@/types/leadList';
import type { FacebookDiscoveryRecord } from '@/app/api/facebook-discovery/route';

type WorkflowStep = 'discovery' | 'results' | 'enriching' | 'complete';
type DiscoveryMode = 'group' | 'search' | 'automated';

export interface FacebookCommenter {
  name: string;
  profileUrl: string | null;
  commentText: string;
  city?: string;
  state?: string;
  address?: string;
}

export interface FacebookPostItem {
  post_id: string;
  post_text: string;
  url: string;
  total_comments?: number;
}

interface FacebookLeadGeneratorProps {
  onAddLeads?: (leads: LeadListItem[]) => void;
}

function parseAddress(address: string | null | undefined): { city?: string; state?: string } {
  if (!address || typeof address !== 'string') return {};
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};
  const statePart = parts.find(p => /^[A-Z]{2}$/.test(p) || p === 'Florida' || p === 'California' || p.length === 2);
  const stateIdx = statePart ? parts.indexOf(statePart) : -1;
  if (stateIdx <= 0) return {};
  const state = parts[stateIdx];
  const city = parts[stateIdx - 1];
  return { city, state };
}

export default function FacebookLeadGenerator({ onAddLeads }: FacebookLeadGeneratorProps) {
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('discovery');
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>('search');
  const [groupId, setGroupId] = useState('');
  const [groupUrl, setGroupUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryRecords, setDiscoveryRecords] = useState<FacebookDiscoveryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leadList, setLeadList] = useState<LeadListItem[]>([]);

  // Search flow state
  const [posts, setPosts] = useState<FacebookPostItem[]>([]);
  const [selectedPost, setSelectedPost] = useState<FacebookPostItem | null>(null);
  const [commenters, setCommenters] = useState<FacebookCommenter[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  // Automated search (Inngest job)
  const [automatedQueries, setAutomatedQueries] = useState('health insurance, COBRA');
  const [automatedMaxPosts, setAutomatedMaxPosts] = useState(20);
  const [automatedIncludeAds, setAutomatedIncludeAds] = useState(true);
  const [automatedJobId, setAutomatedJobId] = useState<string | null>(null);
  const [isStartingAutomated, setIsStartingAutomated] = useState(false);
  const [isLoadingAutomatedResults, setIsLoadingAutomatedResults] = useState(false);

  const handleSearchPosts = async () => {
    const query = searchQuery.trim() || 'coffee';
    setIsDiscovering(true);
    setError(null);
    setPosts([]);
    setSelectedPost(null);
    setCommenters([]);
    try {
      const res = await fetch('/api/facebook-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search_posts', query }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Search failed');
      const items = json.data?.data?.items ?? json.data?.items ?? [];
      const list: FacebookPostItem[] = items.map((p: any) => ({
        post_id: p.basic_info?.post_id || p.post_id || '',
        post_text: (p.basic_info?.post_text || p.post_text || '').slice(0, 120),
        url: p.basic_info?.url || p.url || '',
        total_comments: p.feedback_details?.total_comments ?? p.total_comments,
      })).filter((x: FacebookPostItem) => x.url);
      setPosts(list);
      setWorkflowStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleFetchComments = async (post: FacebookPostItem) => {
    setSelectedPost(post);
    setIsLoadingComments(true);
    setError(null);
    setCommenters([]);
    try {
      const res = await fetch('/api/facebook-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post_comments', link: post.url }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get comments');
      const comments = json.data?.data?.comments ?? json.data?.comments ?? [];
      const list: FacebookCommenter[] = comments.map((c: any) => ({
        name: c.author?.name || 'Unknown',
        profileUrl: c.author?.url || null,
        commentText: (c.comment_text || c.preferred_body_text || '').slice(0, 80),
      }));
      setCommenters(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleStartAutomatedSearch = async () => {
    const queries = automatedQueries.split(',').map((q) => q.trim()).filter(Boolean);
    if (queries.length === 0) {
      setError('Enter at least one keyword (e.g. health insurance, COBRA)');
      return;
    }
    setIsStartingAutomated(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs/facebook-automated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries,
          maxPostsPerQuery: automatedMaxPosts,
          fetchLocation: true,
          includeAds: automatedIncludeAds,
          country: 'US',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start job');
      setAutomatedJobId(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start automated search');
    } finally {
      setIsStartingAutomated(false);
    }
  };

  const handleAddAutomatedResultsToLeadList = async () => {
    if (!automatedJobId) return;
    setIsLoadingAutomatedResults(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/results?jobId=${encodeURIComponent(automatedJobId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load results');
      const rawLeads = data.results?.leads ?? [];
      if (rawLeads.length === 0 && !data.results) {
        throw new Error('Job not completed yet or no results. Check Background Jobs and try again when done.');
      }
      const newLeads: LeadListItem[] = rawLeads.map((l: any, idx: number) => {
        const name = l.name || 'Unknown';
        const nameParts = name.split(' ');
        return {
          id: l.id || `fb-auto-${Date.now()}-${idx}`,
          name,
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          city: l.city,
          state: l.state,
          location: l.city && l.state ? `${l.city}, ${l.state}` : undefined,
          source: l.source || 'Facebook automated',
          platform: 'facebook',
          addedAt: l.addedAt || new Date().toISOString(),
          enriched: false,
          dncChecked: false,
        };
      });
      if (onAddLeads) onAddLeads(newLeads);
      else setLeadList((prev) => [...prev, ...newLeads]);
      alert(`Added ${newLeads.length} leads to your list.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add results');
    } finally {
      setIsLoadingAutomatedResults(false);
    }
  };

  const handleFetchLocations = async () => {
    const withUrl = commenters.filter(c => c.profileUrl);
    if (withUrl.length === 0) return;
    setIsLoadingLocations(true);
    setError(null);
    try {
      const updated = await Promise.all(commenters.map(async (c) => {
        if (!c.profileUrl) return c;
        try {
          const res = await fetch('/api/facebook-posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'page_details', link: c.profileUrl }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) return c;
          const addr = json.data?.address ?? json.data?.maps_address;
          const { city, state } = parseAddress(addr || json.data?.address);
          return { ...c, address: addr, city, state };
        } catch {
          return c;
        }
      }));
      setCommenters(updated);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const handleFacebookScan = async () => {
    if (!groupId && !groupUrl) {
      setError('Please provide either a Group ID or Group URL');
      return;
    }

    setIsDiscovering(true);
    setError(null);
    setDiscoveryRecords([]);

    try {
      const response = await fetch('/api/facebook-discovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          groupId: groupId || undefined,
          groupUrl: groupUrl || undefined,
          keywords: keywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to discover Facebook leads');
      }

      setDiscoveryRecords(data.records || []);
      setWorkflowStep('results');
    } catch (err) {
      console.error('[FACEBOOK_SCAN] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to scan Facebook group');
    } finally {
      setIsDiscovering(false);
    }
  };

  const addCommentersToLeadList = () => {
    if (commenters.length === 0) {
      alert('No commenters to add');
      return;
    }
    const sourceStr = selectedPost ? `Facebook - ${searchQuery || 'search'} - post` : 'Facebook';
    const newLeads: LeadListItem[] = commenters.map((c, idx) => {
      const nameParts = (c.name || 'Unknown').split(' ');
      return {
        id: `fb-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        name: c.name || 'Unknown',
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        title: undefined,
        company: undefined,
        location: c.city && c.state ? `${c.city}, ${c.state}` : undefined,
        linkedinUrl: undefined,
        phone: undefined,
        email: undefined,
        city: c.city,
        state: c.state,
        zipCode: undefined,
        dateOfBirth: undefined,
        age: undefined,
        income: undefined,
        dncStatus: undefined,
        dncReason: undefined,
        canContact: undefined,
        addedAt: new Date().toISOString(),
        source: sourceStr,
        platform: 'facebook' as const,
        sourceDetails: selectedPost ? { postId: selectedPost.post_id } : undefined,
        enriched: false,
        dncChecked: false,
      };
    });
    const existingKeys = new Set(leadList.map(l => l.name));
    const uniqueNewLeads = newLeads.filter(l => !existingKeys.has(l.name));
    if (onAddLeads) {
      onAddLeads(uniqueNewLeads);
      alert(`Added ${uniqueNewLeads.length} leads to pipeline (${newLeads.length - uniqueNewLeads.length} duplicates skipped)`);
    } else {
      setLeadList(prev => [...prev, ...uniqueNewLeads]);
      alert(`Added ${uniqueNewLeads.length} leads to your list (${newLeads.length - uniqueNewLeads.length} duplicates skipped)`);
    }
  };

  const addToLeadList = () => {
    if (discoveryMode === 'search' && commenters.length > 0) {
      addCommentersToLeadList();
      return;
    }
    if (discoveryRecords.length === 0) {
      alert('No discovery records to add');
      return;
    }

    const newLeads: LeadListItem[] = discoveryRecords
      .filter(record => !record.is_anonymous && record.fb_name)
      .map((record, idx) => {
        const nameParts = (record.fb_name || '').split(' ');
        const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
        const sourceDetails: SourceDetails = {
          groupName: record.group_name,
          groupId: record.group_id,
          keywords: record.detected_keywords.length > 0 ? record.detected_keywords : keywordArray,
          postId: record.fb_post_id,
          commentId: record.fb_comment_id,
        };
        const sourceParts: string[] = ['Facebook'];
        if (record.group_name) sourceParts.push(record.group_name);
        if (record.detected_keywords.length > 0) sourceParts.push(record.detected_keywords.slice(0, 2).join(', '));
        return {
          id: `fb-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
          name: record.fb_name || 'Unknown',
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          title: undefined,
          company: undefined,
          location: undefined,
          linkedinUrl: undefined,
          phone: record.extracted_phone?.[0],
          email: undefined,
          city: undefined,
          state: undefined,
          zipCode: undefined,
          dateOfBirth: undefined,
          age: undefined,
          income: undefined,
          dncStatus: undefined,
          dncReason: undefined,
          canContact: undefined,
          addedAt: new Date().toISOString(),
          source: sourceParts.join(' - '),
          platform: 'facebook' as const,
          sourceDetails: Object.keys(sourceDetails).length > 0 ? sourceDetails : undefined,
          enriched: false,
          dncChecked: false,
        };
      });

    const existingKeys = new Set(leadList.map(l => `${l.name}:${l.phone || ''}`));
    const uniqueNewLeads = newLeads.filter(lead => !existingKeys.has(`${lead.name}:${lead.phone || ''}`));
    if (onAddLeads) {
      onAddLeads(uniqueNewLeads);
      alert(`Added ${uniqueNewLeads.length} leads to pipeline`);
    } else {
      setLeadList(prev => [...prev, ...uniqueNewLeads]);
      alert(`Added ${uniqueNewLeads.length} leads to your list (${newLeads.length - uniqueNewLeads.length} duplicates skipped)`);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-slate-200 tracking-tight mb-1 font-data">Configure Search</h2>
        <p className="text-sm text-slate-400 font-data">Target and scrape leads from facebook.</p>
      </div>

      {error && (
        <div className="px-6 py-4 bg-red-900/20 backdrop-blur-sm border border-red-500/50 rounded-xl shadow-xl animate-fade-in">
          <p className="text-red-400 font-medium">Error: {error}</p>
        </div>
      )}

      {/* Discovery Configuration */}
      {workflowStep === 'discovery' && (
        <div className="space-y-6 panel-inactive rounded-2xl p-6">
          <div className="flex gap-2 border-b border-slate-700/50 pb-3 relative z-10" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={discoveryMode === 'search'}
              onClick={() => setDiscoveryMode('search')}
              className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-colors ${discoveryMode === 'search' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-600/50'}`}
            >
              Search posts
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={discoveryMode === 'group'}
              onClick={() => setDiscoveryMode('group')}
              className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-colors ${discoveryMode === 'group' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-600/50'}`}
            >
              Group
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={discoveryMode === 'automated'}
              onClick={() => setDiscoveryMode('automated')}
              className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-colors ${discoveryMode === 'automated' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-600/50'}`}
            >
              Automated
            </button>
          </div>

          {discoveryMode === 'search' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Search query</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. coffee, insurance, real estate"
                  className="w-full px-4 py-2.5 field-inactive rounded-xl text-slate-200 focus:field-focused"
                />
                <p className="mt-1 text-xs text-slate-500">Find public posts by keyword, then get commenters as leads.</p>
              </div>
              <button
                onClick={handleSearchPosts}
                disabled={isDiscovering}
                className="w-full group relative px-5 py-3 btn-active rounded-xl text-white text-sm font-semibold state-transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDiscovering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                {isDiscovering ? 'Searching...' : 'Search posts'}
              </button>
            </>
          )}

          {discoveryMode === 'group' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Group ID or URL</label>
                <input
                  type="text"
                  value={groupUrl || groupId}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.includes('facebook.com/groups/')) {
                      setGroupUrl(value);
                      setGroupId('');
                    } else {
                      setGroupId(value);
                      setGroupUrl('');
                    }
                  }}
                  placeholder="https://www.facebook.com/groups/123456789/ or 123456789"
                  className="w-full px-4 py-2.5 field-inactive rounded-xl text-slate-200 focus:field-focused"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Keywords (comma-separated)</label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="real estate, investment, property"
                  className="w-full px-4 py-2.5 field-inactive rounded-xl text-slate-200 focus:field-focused"
                />
              </div>
              <button
                onClick={handleFacebookScan}
                disabled={isDiscovering || (!groupId && !groupUrl)}
                className="w-full group relative px-5 py-3 btn-active rounded-xl text-white text-sm font-semibold state-transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDiscovering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                {isDiscovering ? 'Scanning group...' : 'Run Facebook Scan'}
              </button>
            </>
          )}

          {discoveryMode === 'automated' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Keywords (comma-separated)</label>
                <input
                  type="text"
                  value={automatedQueries}
                  onChange={(e) => setAutomatedQueries(e.target.value)}
                  placeholder="health insurance, COBRA, Medicare"
                  className="w-full px-4 py-2.5 field-inactive rounded-xl text-slate-200 focus:field-focused"
                />
                <p className="mt-1 text-xs text-slate-500">Search posts and ads for these terms, collect commenters, and fetch location when available.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Max posts per keyword</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={automatedMaxPosts}
                    onChange={(e) => setAutomatedMaxPosts(Math.max(1, Math.min(100, Number(e.target.value) || 20)))}
                    className="w-full px-4 py-2.5 field-inactive rounded-xl text-slate-200 focus:field-focused"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">City and state are always fetched for commenters when available (from Pages).</p>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={automatedIncludeAds}
                  onChange={(e) => setAutomatedIncludeAds(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Include ads (search ads by keyword)</span>
              </label>
              <button
                onClick={handleStartAutomatedSearch}
                disabled={isStartingAutomated}
                className="w-full group relative px-5 py-3 btn-active rounded-xl text-white text-sm font-semibold state-transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isStartingAutomated ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                {isStartingAutomated ? 'Starting job...' : 'Run automated search'}
              </button>
              {automatedJobId && (
                <div className="mt-4 p-4 panel-inactive rounded-xl space-y-2">
                  <p className="text-sm text-slate-300">Job started. ID: <code className="text-slate-100">{automatedJobId}</code></p>
                  <p className="text-xs text-slate-500">Monitor progress in the Background Jobs widget. When complete, add results to your lead list below.</p>
                  <button
                    type="button"
                    onClick={handleAddAutomatedResultsToLeadList}
                    disabled={isLoadingAutomatedResults}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoadingAutomatedResults ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                    Add results to lead list
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Search flow: posts list then commenters */}
      {workflowStep === 'results' && discoveryMode === 'search' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-200">Posts</h2>
            <button
              type="button"
              onClick={() => { setWorkflowStep('discovery'); setPosts([]); setCommenters([]); setSelectedPost(null); }}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              New search
            </button>
          </div>
          {posts.length === 0 && (
            <p className="text-slate-400">No posts found. Try another query.</p>
          )}
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {posts.map((post) => (
              <li key={post.post_id} className="panel-inactive rounded-lg p-3 flex items-center justify-between gap-2">
                <span className="text-slate-300 text-sm truncate flex-1">{post.post_text || post.url}</span>
                <button
                  type="button"
                  onClick={() => handleFetchComments(post)}
                  disabled={isLoadingComments}
                  className="px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-medium flex items-center gap-1"
                >
                  {isLoadingComments && selectedPost?.post_id === post.post_id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <MessageSquare className="w-3 h-3" />
                  )}
                  Get comments
                </button>
              </li>
            ))}
          </ul>
          {commenters.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-700/50">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-slate-200">Commenters ({commenters.length})</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFetchLocations}
                    disabled={isLoadingLocations || commenters.filter(c => c.profileUrl).length === 0}
                    className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    {isLoadingLocations ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                    Fetch location (Pages)
                    {commenters.length > 0 && (
                      <span className="text-slate-400 text-xs font-normal">
                        ({commenters.filter(c => c.profileUrl).length} with profile)
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={addCommentersToLeadList}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Add to Lead List
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl panel-inactive max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-2 text-left text-slate-200 font-semibold">Name</th>
                      <th className="px-4 py-2 text-left text-slate-200 font-semibold">Comment</th>
                      <th className="px-4 py-2 text-left text-slate-200 font-semibold">City / State</th>
                      <th className="px-4 py-2 text-left text-slate-200 font-semibold">Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commenters.map((c, i) => (
                      <tr key={i} className="table-row-inactive">
                        <td className="px-4 py-2 text-slate-200 font-medium">{c.name}</td>
                        <td className="px-4 py-2 text-slate-400 truncate max-w-[200px]" title={c.commentText}>{c.commentText}</td>
                        <td className="px-4 py-2 text-slate-400">{c.city || c.state ? `${c.city || ''} ${c.state || ''}`.trim() || '-' : '-'}</td>
                        <td className="px-4 py-2">{c.profileUrl ? <Link2 className="w-4 h-4 text-blue-400" /> : <span className="text-slate-600">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Discovery Results (group flow only) */}
      {workflowStep === 'results' && discoveryMode === 'group' && discoveryRecords.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-200 tracking-tight mb-1">Discovery Results</h2>
              <p className="text-sm text-slate-400">
                {discoveryRecords.length} records found
                {discoveryRecords.filter(r => !r.is_anonymous).length > 0 && (
                  <span className="ml-2 text-blue-400">
                    ({discoveryRecords.filter(r => !r.is_anonymous).length} with names)
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={addToLeadList}
              className="group px-4 py-2.5 btn-inactive rounded-xl text-slate-200 text-sm font-medium flex items-center gap-2"
            >
              <Users className="w-4 h-4 group-hover:scale-110 group-hover:text-blue-400 transition-transform duration-300" />
              Add to Lead List
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl panel-inactive">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-6 py-4 text-left text-slate-200 font-semibold">Name</th>
                  <th className="px-6 py-4 text-left text-slate-200 font-semibold">Message</th>
                  <th className="px-6 py-4 text-left text-slate-200 font-semibold">Phone</th>
                  <th className="px-6 py-4 text-left text-slate-200 font-semibold">Keywords</th>
                  <th className="px-6 py-4 text-left text-slate-200 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody>
                {discoveryRecords
                  .filter(record => !record.is_anonymous && record.fb_name)
                  .map((record, index) => (
                    <tr key={index} className="group table-row-inactive">
                      <td className="px-6 py-4 text-slate-200 group-hover:text-blue-300 transition-colors duration-300 font-medium">
                        {record.fb_name || 'Anonymous'}
                      </td>
                      <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300 max-w-md truncate" title={record.raw_message}>
                        {record.raw_message.substring(0, 100)}{record.raw_message.length > 100 ? '...' : ''}
                      </td>
                      <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300">
                        {record.extracted_phone.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-green-400" />
                            <span className="text-green-400">{record.extracted_phone[0]}</span>
                            {record.extracted_phone.length > 1 && (
                              <span className="text-xs text-slate-500">+{record.extracted_phone.length - 1}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300">
                        {record.detected_keywords.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {record.detected_keywords.slice(0, 2).map((keyword, idx) => (
                              <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                <Hash className="w-3 h-3 mr-1" />
                                {keyword}
                              </span>
                            ))}
                            {record.detected_keywords.length > 2 && (
                              <span className="text-xs text-slate-500">+{record.detected_keywords.length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 group-hover:text-slate-300 transition-colors duration-300">
                        {record.fb_comment_id ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Comment
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            Post
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {discoveryRecords.filter(r => !r.is_anonymous && r.fb_name).length === 0 && (
            <div className="px-6 py-8 panel-inactive rounded-lg text-center">
              <p className="text-slate-400">No named users found. All records are anonymous.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
