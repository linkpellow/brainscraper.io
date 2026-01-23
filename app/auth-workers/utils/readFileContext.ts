/**
 * File Context Reader
 * 
 * Provides utilities to read file context for error diagnosis.
 * Note: This runs in the browser, so we can't directly read files.
 * Instead, we prepare the information for the AI to read the files.
 */

import type { CodeLocation } from './codebaseAwareLogging';

/**
 * Generate a file reading instruction for AI
 */
export function generateFileReadInstruction(location: CodeLocation, contextLines: number = 10): string {
  const startLine = Math.max(1, location.line - contextLines);
  const endLine = location.line + contextLines;
  
  return `Read file: ${location.file}\n` +
         `Focus on lines: ${startLine}-${endLine}\n` +
         `Error location: line ${location.line}, column ${location.column}\n` +
         (location.function ? `Function: ${location.function}()\n` : '') +
         `\nSuggested command: read_file("${location.file}", offset=${startLine}, limit=${endLine - startLine + 1})`;
}

/**
 * Generate comprehensive file reading instructions for multiple locations
 */
export function generateMultiFileReadInstructions(locations: CodeLocation[]): string {
  if (locations.length === 0) return '';
  
  const instructions = locations.map((loc, idx) => 
    `${idx + 1}. ${generateFileReadInstruction(loc)}`
  ).join('\n\n');
  
  return `[AI FILE READING INSTRUCTIONS]\n\n${instructions}`;
}

/**
 * Create a diagnostic summary for AI
 */
export function createDiagnosticSummary(
  error: Error | string,
  locations: CodeLocation[]
): string {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  let summary = `[ERROR DIAGNOSTIC SUMMARY]\n\n`;
  summary += `Error: ${errorMessage}\n\n`;
  
  if (locations.length > 0) {
    summary += `[CODEBASE LOCATIONS]\n`;
    locations.forEach((loc, idx) => {
      summary += `${idx + 1}. ${loc.file}:${loc.line}:${loc.column}`;
      if (loc.function) {
        summary += ` (function: ${loc.function})`;
      }
      summary += '\n';
    });
    
    summary += `\n[SUGGESTED ACTIONS]\n`;
    summary += `1. Read the following files to understand context:\n`;
    locations.forEach((loc, idx) => {
      summary += `   - ${loc.file} (around line ${loc.line})\n`;
    });
    summary += `\n2. Check the code at the specified locations for:\n`;
    summary += `   - Type errors\n`;
    summary += `   - Missing imports\n`;
    summary += `   - Incorrect function calls\n`;
    summary += `   - Logic errors\n`;
  }
  
  if (errorStack) {
    summary += `\n[STACK TRACE]\n${errorStack}`;
  }
  
  return summary;
}
