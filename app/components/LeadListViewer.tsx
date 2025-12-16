/**
 * Lead List Viewer Component
 * 
 * Displays accumulated leads in a table with all required columns
 */

'use client';

import { useState } from 'react';
import { Search, Download, Trash2, X } from 'lucide-react';
import type { LeadListItem } from '@/types/leadList';

interface LeadListViewerProps {
  leads: LeadListItem[];
  onClose: () => void;
  onRemoveLead: (id: string) => void;
  onClearList: () => void;
  onExport: () => void;
  onEnrichList: () => void;
}

export default function LeadListViewer({
  leads,
  onClose,
  onRemoveLead,
  onClearList,
  onExport,
  onEnrichList
}: LeadListViewerProps) {
  const [sortField, setSortField] = useState<keyof LeadListItem>('addedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sortedLeads = [...leads].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;
    
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const enrichedCount = leads.filter(l => l.enriched).length;
  const dncCheckedCount = leads.filter(l => l.dncChecked).length;
  const safeToContactCount = leads.filter(l => l.canContact === true).length;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-hacker-bg-secondary terminal-border w-full max-w-[95vw] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="terminal-border-b p-4 bg-hacker-bg-tertiary/60">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-hacker-cyan terminal-glow">Lead List</h2>
              <p className="text-sm text-hacker-text-primary-dim mt-1">
                {leads.length} total leads • {enrichedCount} enriched • {dncCheckedCount} DNC checked • {safeToContactCount} safe to contact
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-hacker-text-primary hover:text-hacker-cyan transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={onEnrichList}
              disabled={leads.length === 0}
              className="terminal-border px-4 py-2 bg-hacker-bg-tertiary/60 hover:bg-hacker-cyan/20 hover:border-hacker-cyan transition-all text-hacker-text-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Enrich All ({leads.length})
            </button>
            <button
              onClick={onExport}
              disabled={leads.length === 0}
              className="terminal-border px-4 py-2 bg-hacker-bg-tertiary/60 hover:bg-hacker-cyan/20 hover:border-hacker-cyan transition-all text-hacker-text-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={onClearList}
              disabled={leads.length === 0}
              className="terminal-border px-4 py-2 bg-red-900/40 hover:bg-red-900/60 hover:border-red-500 transition-all text-hacker-text-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed ml-auto flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear List
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-4">
          {leads.length === 0 ? (
            <div className="text-center py-12 text-hacker-text-primary-dim">
              <p className="text-lg">No leads in list yet</p>
              <p className="text-sm mt-2">Add leads from search results to build your list</p>
            </div>
          ) : (
            <table className="w-full text-sm text-hacker-text-primary">
              <thead className="sticky top-0 bg-hacker-bg-tertiary/80 backdrop-blur-sm">
                <tr className="terminal-border-b border-hacker-cyan/30">
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left cursor-pointer hover:text-hacker-cyan" onClick={() => {
                    setSortField('name');
                    setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                  }}>
                    Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="p-2 text-left">Phone</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">DOB</th>
                  <th className="p-2 text-left">Age</th>
                  <th className="p-2 text-left">City</th>
                  <th className="p-2 text-left">State</th>
                  <th className="p-2 text-left">Zip</th>
                  <th className="p-2 text-left">Income</th>
                  <th className="p-2 text-left">DNC Status</th>
                  <th className="p-2 text-left">Company</th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeads.map((lead, idx) => (
                  <tr 
                    key={lead.id}
                    className="terminal-border-b border-hacker-cyan/10 hover:bg-hacker-bg-tertiary/40 transition-colors"
                  >
                    <td className="p-2 text-hacker-text-primary-dim">{idx + 1}</td>
                    <td className="p-2 font-medium">
                      {lead.name}
                      {lead.enriched && <span className="ml-2 text-xs text-green-400">✓</span>}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {lead.phone || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2 text-xs">
                      {lead.email || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2 text-xs">
                      {lead.dateOfBirth || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2">
                      {lead.age || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2">
                      {lead.city || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2">
                      {lead.state || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {lead.zipCode || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2 text-xs">
                      {lead.income || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2">
                      {lead.dncStatus ? (
                        <span className={`text-xs px-2 py-1 rounded ${
                          lead.dncStatus === 'Safe' ? 'bg-green-900/40 text-green-300' :
                          lead.dncStatus === 'Do Not Call' ? 'bg-red-900/40 text-red-300' :
                          'bg-yellow-900/40 text-yellow-300'
                        }`}>
                          {lead.dncStatus}
                        </span>
                      ) : (
                        <span className="text-hacker-text-primary-dim italic">-</span>
                      )}
                    </td>
                    <td className="p-2 text-xs max-w-[150px] truncate" title={lead.company}>
                      {lead.company || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2 text-xs max-w-[150px] truncate" title={lead.title}>
                      {lead.title || <span className="text-hacker-text-primary-dim italic">-</span>}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => onRemoveLead(lead.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                        title="Remove from list"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

