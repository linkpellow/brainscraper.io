'use client';

import React from 'react';
import { ParsedData } from '@/utils/parseFile';
import { EnrichedRow, EnrichedData } from '@/utils/enrichData';
import { useState } from 'react';
import { extractLeadSummary, leadSummariesToCSV, LeadSummary, formatPhoneNumber } from '@/utils/extractLeadSummary';
import { DNCResult } from './USHAScrubber';

interface DataTableProps {
  data: ParsedData | EnrichedData;
  fileName: string;
  isEnriched?: boolean;
  dncResults?: DNCResult[];
}

type SortField = 'state' | 'none';
type SortDirection = 'asc' | 'desc';

export default function DataTable({ data, fileName, isEnriched = false, dncResults = [] }: DataTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'full' | 'summary'>('full');
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const rowsPerPage = 50;

  const toggleRowExpansion = (rowIndex: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowIndex)) {
      newExpanded.delete(rowIndex);
    } else {
      newExpanded.add(rowIndex);
    }
    setExpandedRows(newExpanded);
  };

  const handlePrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Create a map of phone numbers to DNC results for quick lookup
  const dncMap = new Map<string, DNCResult>();
  dncResults.forEach(result => {
    // Normalize phone number (remove formatting for matching)
    const normalizedPhone = result.phone.replace(/\D/g, '');
    if (normalizedPhone) {
      dncMap.set(normalizedPhone, result);
    }
  });

  // Helper function to find DNC data for a row
  const findDNCData = (row: EnrichedRow): DNCResult | undefined => {
    // Try to find phone in original row data
    const phone = row['Phone'] || row['phone'] || row['Phone Number'] || row['PhoneNumber'] || 
                  row['phone_number'] || row['Mobile'] || row['mobile'] || 
                  row['Primary Phone'] || row['PrimaryPhone'] || '';
    
    if (phone) {
      const normalizedPhone = String(phone).replace(/\D/g, '');
      return dncMap.get(normalizedPhone);
    }
    
    // Try enriched data
    if (row._enriched?.phone) {
      const normalizedPhone = String(row._enriched.phone).replace(/\D/g, '');
      return dncMap.get(normalizedPhone);
    }
    
    return undefined;
  };

  // Generate lead summaries for enriched data
  const allLeadSummaries: LeadSummary[] = isEnriched
    ? (data as EnrichedData).rows.map(row => {
        const enrichedRow = row as EnrichedRow;
        const dncData = findDNCData(enrichedRow);
        return extractLeadSummary(enrichedRow, enrichedRow._enriched, dncData);
      })
    : [];

  // Sort lead summaries
  const sortedLeadSummaries = [...allLeadSummaries];
  if (sortField !== 'none' && isEnriched) {
    sortedLeadSummaries.sort((a, b) => {
      let comparison = 0;
      
      if (sortField === 'state') {
        const stateA = (a.state || '').toUpperCase();
        const stateB = (b.state || '').toUpperCase();
        comparison = stateA.localeCompare(stateB);
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  const leadSummaries = sortedLeadSummaries;

  // Use sorted data for pagination if in summary view and enriched
  const displayData = viewMode === 'summary' && isEnriched ? leadSummaries : data.rows;
  const totalPages = Math.ceil(displayData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = displayData.slice(startIndex, endIndex);

  // Handle sort change
  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Export to CSV (uses sorted data)
  const handleExportCSV = () => {
    if (!isEnriched || leadSummaries.length === 0) {
      alert('No enriched data to export. Please enrich your data first.');
      return;
    }

    const csv = leadSummariesToCSV(leadSummaries);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/\.[^/.]+$/, '')}_lead_summary.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Get summary rows for current page (already sliced in currentRows when in summary mode)
  const summaryRows = viewMode === 'summary' && isEnriched
    ? (currentRows as LeadSummary[])
    : [];

  return (
    <div className="w-full space-y-4">
      {/* File Info */}
      <div className="terminal-border p-6 bg-hacker-bg-tertiary/60">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-hacker-text-primary terminal-glow-sm">
              &gt; File: <span className="text-hacker-text-primary">{fileName}</span>
            </p>
            <p className="text-hacker-text-primary-dim text-sm mt-1">
              Rows: {data.rowCount.toLocaleString()} | Columns: {data.columnCount} | Page {currentPage} of {totalPages}
              {isEnriched && (
                <span className="text-hacker-text-primary ml-2">| ? Enriched</span>
              )}
            </p>
          </div>
          {isEnriched && (
            <div className="space-y-3 mt-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setViewMode('full')}
                  className={`terminal-border px-3 py-1 text-sm transition-all ${
                    viewMode === 'full'
                      ? 'bg-hacker-bg-tertiary/80 text-hacker-text-primary terminal-glow-sm'
                      : 'bg-hacker-bg-tertiary/60 text-hacker-text-primary-dim hover:bg-hacker-bg-tertiary/70'
                  }`}
                >
                  Full View
                </button>
                <button
                  onClick={() => setViewMode('summary')}
                  className={`terminal-border px-3 py-1 text-sm transition-all ${
                    viewMode === 'summary'
                      ? 'bg-hacker-bg-tertiary/80 text-hacker-text-primary terminal-glow-sm'
                      : 'bg-hacker-bg-tertiary/60 text-hacker-text-primary-dim hover:bg-hacker-bg-tertiary/70'
                  }`}
                >
                  Summary View (Essential Fields)
                </button>
                <button
                  onClick={handleExportCSV}
                  className="terminal-border px-3 py-1 bg-hacker-bg-tertiary/60 hover:bg-hacker-bg-tertiary/80 text-hacker-text-primary text-sm terminal-glow-sm"
                >
                  Export CSV (Summary)
                </button>
              </div>
              
              {/* Sorting Controls */}
              <div className="flex flex-wrap items-center gap-3 terminal-border p-3 bg-hacker-bg-tertiary/40">
                <span className="text-hacker-text-primary-dim text-sm">Sort by:</span>
                <button
                  onClick={() => handleSortChange('state')}
                  className={`terminal-border px-3 py-1 text-sm transition-all ${
                    sortField === 'state'
                      ? 'bg-hacker-bg-tertiary/80 text-hacker-text-primary terminal-glow-sm'
                      : 'bg-hacker-bg-tertiary/60 text-hacker-text-primary-dim hover:bg-hacker-bg-tertiary/70'
                  }`}
                >
                  State {sortField === 'state' && (sortDirection === 'asc' ? '?' : '?')}
                </button>
                {sortField !== 'none' && (
                  <button
                    onClick={() => {
                      setSortField('none');
                      setSortDirection('desc');
                    }}
                    className="terminal-border px-3 py-1 bg-hacker-bg-tertiary/60 hover:bg-hacker-bg-tertiary/80 text-hacker-text-primary-dim text-sm"
                  >
                    Clear Sort
                  </button>
                )}
                {sortField !== 'none' && (
                  <span className="text-hacker-text-primary-dim text-xs">
                    (Sorted by state ${sortDirection === 'asc' ? 'A-Z' : 'Z-A'})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="terminal-border overflow-x-auto bg-hacker-bg-tertiary/60">
        <div className="min-w-full inline-block">
          {viewMode === 'summary' && isEnriched ? (
            // Summary View - Essential Fields Only: NAME, PHONE (TOP PRIORITY), DOB/AGE, ZIPCODE, STATE, CITY, EMAIL, DNC STATUS
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="bg-hacker-bg-tertiary/70">
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">Name</th>
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">
                    Phone <span className="text-green-600">?</span>
                  </th>
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">DOB or Age</th>
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">Zipcode</th>
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">State</th>
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">City</th>
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">Email</th>
                  <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">
                    DNC Status <span className="text-red-500">*</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="border border-hacker-cyan/30 px-4 py-8 text-center text-hacker-text-primary-dim">
                      No summary data available
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((summary, index) => {
                    const actualIndex = startIndex + index;
                    return (
                      <tr key={actualIndex} className="hover:bg-hacker-green-glow/20 transition-colors">
                        <td className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary whitespace-nowrap">
                          {summary.name || 'N/A'}
                        </td>
                        <td className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary font-semibold whitespace-nowrap">
                          {formatPhoneNumber(summary.phone)}
                        </td>
                        <td className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary whitespace-nowrap">
                          {summary.dobOrAge || 'N/A'}
                        </td>
                        <td className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary whitespace-nowrap">
                          {summary.zipcode || 'N/A'}
                        </td>
                        <td className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary whitespace-nowrap">
                          {summary.state || 'N/A'}
                        </td>
                        <td className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary whitespace-nowrap">
                          {summary.city || 'N/A'}
                        </td>
                        <td className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary whitespace-nowrap">
                          {summary.email || 'N/A'}
                        </td>
                        <td className={`border border-hacker-cyan/30 px-4 py-2 whitespace-nowrap ${
                          summary.dncStatus === 'YES' ? 'text-red-600 font-bold' : 
                          summary.dncStatus === 'NO' ? 'text-green-600' : 
                          'text-hacker-text-primary-dim'
                        }`}>
                          {summary.dncStatus || 'UNKNOWN'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            // Full View - All Columns
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="bg-hacker-bg-tertiary/70">
                  {data.headers.map((header, index) => (
                    <th
                      key={index}
                      className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                  {isEnriched && (
                    <th className="border border-hacker-cyan/30 px-4 py-3 text-left text-hacker-text-primary terminal-glow-sm whitespace-nowrap">
                      Enrichment
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
              {currentRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.headers.length}
                    className="border border-hacker-cyan/30 px-4 py-8 text-center text-hacker-text-primary-dim"
                  >
                    No data rows
                  </td>
                </tr>
              ) : (
                currentRows.map((row, rowIndex) => {
                  const actualRowIndex = startIndex + rowIndex;
                  const enrichedRow = row as EnrichedRow;
                  const hasEnrichment = isEnriched && '_enriched' in enrichedRow && enrichedRow._enriched;
                  const isExpanded = expandedRows.has(actualRowIndex);
                  
                  return (
                    <React.Fragment key={actualRowIndex}>
                      <tr className="hover:bg-hacker-green-glow/20 transition-colors">
                        {data.headers.map((header, colIndex) => {
                          const rowData = row as Record<string, string | number>;
                          return (
                            <td
                              key={colIndex}
                              className="border border-hacker-cyan/30 px-4 py-2 text-hacker-text-primary whitespace-nowrap"
                            >
                              {String(rowData[header] ?? '')}
                            </td>
                          );
                        })}
                        {hasEnrichment && (
                          <td className="border border-hacker-cyan/30 px-4 py-2">
                            <button
                              onClick={() => toggleRowExpansion(actualRowIndex)}
                              className="text-hacker-text-primary hover:text-hacker-text-primary terminal-glow-sm text-xs"
                            >
                              {isExpanded ? '?' : '?'} Enrichment
                            </button>
                          </td>
                        )}
                      </tr>
                      {hasEnrichment && isExpanded && (
                        <tr>
                          <td colSpan={data.headers.length + (hasEnrichment ? 1 : 0)} className="border border-hacker-cyan/30 px-4 py-3 bg-hacker-bg-tertiary/60">
                            <div className="space-y-4">
                              {enrichedRow._enriched?.telnyxLookupData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Telnyx Phone Lookup (Carrier & Caller Name):
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.telnyxLookupData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.skipTracingData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Skip-Tracing Data (Email/Phone):
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.skipTracingData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.incomeData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Income Data{enrichedRow._enriched.zipCode ? ` (Zip: ${enrichedRow._enriched.zipCode})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.incomeData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.companyData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Company Data{enrichedRow._enriched.domain ? ` (Domain: ${enrichedRow._enriched.domain})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.companyData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.freshLinkedinCompanyData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Fresh LinkedIn Company Data{enrichedRow._enriched.linkedinCompanyUrl ? ` (URL: ${enrichedRow._enriched.linkedinCompanyUrl})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.freshLinkedinCompanyData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.websiteContactsData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Website Contacts{enrichedRow._enriched.domain ? ` (Domain: ${enrichedRow._enriched.domain})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.websiteContactsData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.linkedinProfileData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; LinkedIn Profile Data{enrichedRow._enriched.linkedinUrl ? ` (URL: ${enrichedRow._enriched.linkedinUrl})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.linkedinProfileData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.freshLinkedinProfileData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Fresh LinkedIn Profile Data (Enriched){enrichedRow._enriched.linkedinUrl ? ` (URL: ${enrichedRow._enriched.linkedinUrl})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.freshLinkedinProfileData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.linkedinSalesNavigatorData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; LinkedIn Sales Navigator Data{enrichedRow._enriched.linkedinUrl ? ` (Profile: ${enrichedRow._enriched.linkedinUrl})` : enrichedRow._enriched.linkedinCompanyUrl ? ` (Company: ${enrichedRow._enriched.linkedinCompanyUrl})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.linkedinSalesNavigatorData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.facebookPhotosData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Facebook Profile Photos{enrichedRow._enriched.facebookProfileId ? ` (ID: ${enrichedRow._enriched.facebookProfileId})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.facebookPhotosData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.websiteExtractorData !== undefined && (
                                <div>
                                  <p className="text-hacker-text-primary text-sm font-bold mb-2">
                                    &gt; Website Extractor (Emails & Social Links){enrichedRow._enriched.domain ? ` (Domain: ${enrichedRow._enriched.domain})` : ''}:
                                  </p>
                                  <pre className="text-hacker-text-primary-dim text-xs overflow-x-auto bg-hacker-bg-tertiary/80 p-2 rounded">
                                    {JSON.stringify(enrichedRow._enriched.websiteExtractorData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {enrichedRow._enriched?.error && (
                                <div>
                                  <p className="text-red-400 text-xs font-bold mb-1">
                                    &gt; Errors:
                                  </p>
                                  <p className="text-red-300 text-xs">
                                    {enrichedRow._enriched.error}
                                  </p>
                                </div>
                              )}

                              {!enrichedRow._enriched?.skipTracingData && !enrichedRow._enriched?.incomeData && !enrichedRow._enriched?.error && (
                                <p className="text-hacker-text-primary-dim text-xs">
                                  No enrichment data available
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
      
      {viewMode === 'summary' && isEnriched && (
        <div className="terminal-border p-3 bg-hacker-bg-tertiary/40">
          <p className="text-hacker-text-primary-dim text-xs">
            <span className="text-red-500">*</span> DNC Status: {dncResults.length > 0 
              ? `DNC data loaded for ${dncResults.length} leads. Status will appear automatically after matching phone numbers.`
              : 'Shows "UNKNOWN" until you run USHA DNC scrubbing. After scrubbing and checking results, DNC status will appear automatically.'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between terminal-border p-4 bg-hacker-bg-tertiary/80">
          <button
            onClick={handlePrevious}
            disabled={currentPage === 1}
            className={`
              terminal-border px-4 py-2 bg-hacker-bg-tertiary/60 transition-all focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 focus:ring-offset-hacker-bg
              ${currentPage === 1
                ? 'opacity-50 cursor-not-allowed text-hacker-text-primary-dim'
                : 'hover:bg-hacker-bg-tertiary/80 hover:border-black text-hacker-text-primary terminal-glow-sm'
              }
            `}
            aria-label="Go to previous page"
            aria-disabled={currentPage === 1}
          >
            &lt; Previous
          </button>

          <span className="text-hacker-text-primary-dim">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={handleNext}
            disabled={currentPage === totalPages}
            className={`
              terminal-border px-4 py-2 bg-hacker-bg-tertiary/60 transition-all focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 focus:ring-offset-hacker-bg
              ${currentPage === totalPages
                ? 'opacity-50 cursor-not-allowed text-hacker-text-primary-dim'
                : 'hover:bg-hacker-bg-tertiary/80 hover:border-black text-hacker-text-primary terminal-glow-sm'
              }
            `}
            aria-label="Go to next page"
            aria-disabled={currentPage === totalPages}
          >
            Next &gt;
          </button>
        </div>
      )}
    </div>
  );
}


