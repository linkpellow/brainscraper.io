/**
 * Codebase-Aware Logging Utilities
 * 
 * Enhances console logs with:
 * - Repo-relative file paths
 * - Code context extraction
 * - Source map resolution
 * - Clickable file references
 */

export type CodeLocation = {
  file: string; // Repo-relative path (e.g., "app/auth-workers/page.tsx")
  line: number;
  column: number;
  function?: string;
  codeContext?: string[]; // Lines of code around the error
};

export type EnhancedLogContext = {
  locations: CodeLocation[];
  repoRoot?: string;
  workspacePath?: string;
};

/**
 * Parse stack trace and extract code locations
 */
export function parseStackTrace(stack?: string): CodeLocation[] {
  if (!stack) return [];

  const locations: CodeLocation[] = [];
  const lines = stack.split('\n');

  for (const line of lines) {
    // Match various stack trace formats:
    // 1. at functionName (file:///path/to/file.tsx:123:45)
    // 2. at file:///path/to/file.tsx:123:45
    // 3. at http://localhost:3000/_next/static/chunks/app/page.js:123:45
    // 4. webpack:///./app/page.tsx:123:45
    
    const patterns = [
      // Standard format: at function (file:line:col)
      /at\s+(?:\w+\.)?(\w+)?\s*\(([^)]+):(\d+):(\d+)\)/,
      // Without function: at file:line:col
      /at\s+([^:]+):(\d+):(\d+)/,
      // Webpack format: webpack:///./path/to/file.tsx:123:45
      /webpack:\/\/\/\.\/([^:]+):(\d+):(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        let filePath: string;
        let lineNum: number;
        let colNum: number;
        let functionName: string | undefined;

        if (pattern === patterns[0]) {
          // Standard format with function
          [, functionName, filePath, lineNum, colNum] = match;
        } else if (pattern === patterns[1]) {
          // Without function
          [, filePath, lineNum, colNum] = match;
        } else {
          // Webpack format
          [, filePath, lineNum, colNum] = match;
        }

        // Normalize file path to repo-relative
        const normalizedPath = normalizeFilePath(filePath);
        if (normalizedPath) {
          locations.push({
            file: normalizedPath,
            line: parseInt(lineNum, 10),
            column: parseInt(colNum, 10),
            function: functionName,
          });
        }
      }
    }
  }

  return locations;
}

/**
 * Normalize file path to repo-relative path
 */
function normalizeFilePath(path: string): string | null {
  if (!path) return null;

  // Remove protocol prefixes
  let normalized = path
    .replace(/^file:\/\/\//, '')
    .replace(/^webpack:\/\/\/\.\//, '')
    .replace(/^http:\/\/localhost:\d+\//, '')
    .replace(/^https?:\/\/[^/]+\//, '');

  // Remove Next.js build paths
  normalized = normalized
    .replace(/^_next\/static\/chunks\//, '')
    .replace(/^\.next\/server\/app\//, 'app/')
    .replace(/^\.next\/server\/chunks\//, '');

  // Extract repo-relative path
  // Try to find common patterns like "app/", "src/", "utils/", etc.
  const repoPatterns = [
    /(app\/[^:]+)/,
    /(src\/[^:]+)/,
    /(utils\/[^:]+)/,
    /(components\/[^:]+)/,
    /(hooks\/[^:]+)/,
    /(api\/[^:]+)/,
  ];

  for (const pattern of repoPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // If it's already a relative path starting with app/, src/, etc., use it
  if (/^(app|src|utils|components|hooks|api)\//.test(normalized)) {
    return normalized.split(':')[0]; // Remove line:col if present
  }

  // Try to extract from absolute paths
  const parts = normalized.split('/');
  const appIndex = parts.indexOf('app');
  const srcIndex = parts.indexOf('src');
  const utilsIndex = parts.indexOf('utils');

  if (appIndex !== -1) {
    return parts.slice(appIndex).join('/').split(':')[0];
  }
  if (srcIndex !== -1) {
    return parts.slice(srcIndex).join('/').split(':')[0];
  }
  if (utilsIndex !== -1) {
    return parts.slice(utilsIndex).join('/').split(':')[0];
  }

  // Fallback: return as-is if we can't normalize
  return normalized.split(':')[0];
}

/**
 * Extract code context around a specific line
 * This would ideally read from the actual file, but in browser context we can't do that.
 * Instead, we'll prepare the information for the AI to read the file.
 */
export function getCodeContextInfo(location: CodeLocation): {
  file: string;
  line: number;
  column: number;
  contextLines: number;
  suggestion: string;
} {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    contextLines: 10, // Suggest reading 10 lines before and after
    suggestion: `Read file ${location.file} around line ${location.line} for context`,
  };
}

/**
 * Format log with codebase references for AI consumption
 */
export function formatLogWithCodebase(
  message: string,
  stack?: string,
  args?: any[]
): {
  formatted: string;
  locations: CodeLocation[];
  aiFriendly: string;
} {
  const locations = parseStackTrace(stack);
  
  let aiFriendly = `[LOG] ${message}\n`;
  
  if (locations.length > 0) {
    aiFriendly += '\n[CODEBASE REFERENCES]\n';
    locations.forEach((loc, idx) => {
      aiFriendly += `${idx + 1}. File: ${loc.file}:${loc.line}:${loc.column}`;
      if (loc.function) {
        aiFriendly += ` (in function: ${loc.function})`;
      }
      aiFriendly += '\n';
    });
    aiFriendly += '\n[SUGGESTED ACTION]\n';
    aiFriendly += `Read the following files for context:\n`;
    locations.forEach((loc, idx) => {
      const context = getCodeContextInfo(loc);
      aiFriendly += `  ${idx + 1}. ${context.file} (lines ${context.line - context.contextLines}-${context.line + context.contextLines})\n`;
    });
  }

  if (args && args.length > 0) {
    aiFriendly += '\n[ADDITIONAL DATA]\n';
    args.forEach((arg, idx) => {
      if (arg instanceof Error) {
        aiFriendly += `  Arg ${idx + 1}: Error - ${arg.message}\n`;
        if (arg.stack) {
          aiFriendly += `    Stack: ${arg.stack}\n`;
        }
      } else if (typeof arg === 'object') {
        try {
          aiFriendly += `  Arg ${idx + 1}: ${JSON.stringify(arg, null, 2).substring(0, 500)}\n`;
        } catch {
          aiFriendly += `  Arg ${idx + 1}: [Object]\n`;
        }
      } else {
        aiFriendly += `  Arg ${idx + 1}: ${String(arg)}\n`;
      }
    });
  }

  return {
    formatted: message,
    locations,
    aiFriendly,
  };
}

/**
 * Group logs by file/function for easier debugging
 */
export function groupLogsByLocation(logs: Array<{ locations?: CodeLocation[] }>): Map<string, Array<{ log: any; location: CodeLocation }>> {
  const grouped = new Map<string, Array<{ log: any; location: CodeLocation }>>();

  for (const log of logs) {
    if (log.locations && log.locations.length > 0) {
      for (const location of log.locations) {
        const key = `${location.file}:${location.line}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push({ log, location });
      }
    }
  }

  return grouped;
}
