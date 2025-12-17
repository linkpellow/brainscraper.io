'use client';

import { useState } from 'react';
import { Facebook, Search, Loader2, Users, MessageSquare, Phone, Hash } from 'lucide-react';
import type { LeadListItem, SourceDetails } from '@/types/leadList';
import type { FacebookDiscoveryRecord } from '@/app/api/facebook-discovery/route';

type WorkflowStep = 'discovery' | 'results' | 'enriching' | 'complete';

export default function FacebookLeadGenerator() {
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('discovery');
  const [groupId, setGroupId] = useState('');
  const [groupUrl, setGroupUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryRecords, setDiscoveryRecords] = useState<FacebookDiscoveryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leadList, setLeadList] = useState<LeadListItem[]>([]);

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

  const addToLeadList = () => {
    if (discoveryRecords.length === 0) {
      alert('No discovery records to add');
      return;
    }

    // Filter out anonymous users and convert to LeadListItem format
    const newLeads: LeadListItem[] = discoveryRecords
      .filter(record => !record.is_anonymous && record.fb_name)
      .map((record, idx) => {
        const nameParts = (record.fb_name || '').split(' ');
        const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
        
        // Extract source details
        const sourceDetails: SourceDetails = {
          groupName: record.group_name,
          groupId: record.group_id,
          keywords: record.detected_keywords.length > 0 ? record.detected_keywords : keywordArray,
          postId: record.fb_post_id,
          commentId: record.fb_comment_id,
        };
        
        // Build source string
        const sourceParts: string[] = ['Facebook'];
        if (record.group_name) sourceParts.push(record.group_name);
        if (record.detected_keywords.length > 0) {
          sourceParts.push(record.detected_keywords.slice(0, 2).join(', '));
        }
        const sourceString = sourceParts.join(' - ');

        return {
          id: `fb-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
          name: record.fb_name || 'Unknown',
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          title: undefined,
          company: undefined,
          location: undefined,
          linkedinUrl: undefined,
          phone: record.extracted_phone && record.extracted_phone.length > 0 ? record.extracted_phone[0] : undefined,
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
          source: sourceString,
          platform: 'facebook' as const,
          sourceDetails: Object.keys(sourceDetails).length > 0 ? sourceDetails : undefined,
          enriched: false,
          dncChecked: false,
        };
      });

    // Filter out duplicates by name + phone
    const existingKeys = new Set(leadList.map(l => `${l.name}:${l.phone || ''}`));
    const uniqueNewLeads = newLeads.filter(lead => {
      const key = `${lead.name}:${lead.phone || ''}`;
      return !existingKeys.has(key);
    });

    setLeadList(prev => [...prev, ...uniqueNewLeads]);
    alert(`Added ${uniqueNewLeads.length} leads to your list (${newLeads.length - uniqueNewLeads.length} duplicates skipped)`);
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
          <div className="space-y-4">
            {/* Group ID or URL */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Group ID or URL
              </label>
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
                className="w-full px-4 py-2.5 field-inactive rounded-xl text-slate-200  focus:field-focused"
              />
              <p className="mt-1 text-xs text-slate-500">
                Enter either the full Facebook group URL or just the group ID
              </p>
            </div>

            {/* Keywords */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="real estate, investment, property"
                className="w-full px-4 py-2.5 field-inactive rounded-xl text-slate-200  focus:field-focused"
              />
              <p className="mt-1 text-xs text-slate-500">
                Optional: Filter posts/comments containing these keywords
              </p>
            </div>
          </div>

          <button
            onClick={handleFacebookScan}
            disabled={isDiscovering || (!groupId && !groupUrl)}
            className="w-full group relative px-5 py-3 btn-active rounded-xl text-white text-sm font-semibold state-transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            {isDiscovering ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white relative z-10" />
                <span className="text-white relative z-10">Scanning Facebook Group...</span>
              </>
            ) : (
              <>
                <Search className="w-5 h-5 text-white relative z-10 group-hover:scale-110 transition-transform duration-300" />
                <span className="text-white relative z-10">Run Facebook Scan</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Discovery Results */}
      {workflowStep === 'results' && discoveryRecords.length > 0 && (
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
