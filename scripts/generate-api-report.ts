#!/usr/bin/env tsx
/**
 * Generate API Report from HAR File
 * 
 * Uses existing HAR processing pipeline to generate comprehensive API report
 * Excludes auth endpoints as requested
 */

import * as fs from 'fs';
import * as path from 'path';
import { processHARComplete } from '../app/auth-workers/[sessionId]/map-api/harIngestion';
import type { RequestEvent, EndpointCatalog } from '../app/auth-workers/[sessionId]/map-api/types';

// Auth endpoint patterns to exclude
const AUTH_PATTERNS = [
  '/oauth',
  '/auth',
  '/token',
  '/login',
  '/logout',
  '/refresh',
  '/authenticate',
  '/authorize',
  '/session',
  '/account/login',
  '/account/logout',
  '/api/auth',
  '/api/token',
  '/api/login',
  '/api/oauth',
];

function isAuthEndpoint(url: string, path: string): boolean {
  const urlLower = url.toLowerCase();
  const pathLower = path.toLowerCase();
  
  return AUTH_PATTERNS.some(pattern => 
    urlLower.includes(pattern) || pathLower.includes(pattern)
  );
}

function normalizePath(path: string, query: Record<string, string | string[]>): string {
  // Replace dynamic segments with placeholders
  let normalized = path;
  
  // Replace UUIDs
  normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}');
  
  // Replace numeric IDs
  normalized = normalized.replace(/\/\d+\//g, '/{id}/');
  normalized = normalized.replace(/\/\d+$/g, '/{id}');
  
  // Replace query params in path (if any)
  if (Object.keys(query).length > 0) {
    const sortedParams = Object.keys(query).sort().join(',');
    normalized += `?{${sortedParams}}`;
  }
  
  return normalized;
}

interface APIEndpoint {
  method: string;
  path: string;
  normalizedPath: string;
  host: string;
  fullUrl: string;
  statusCodes: number[];
  requestCount: number;
  avgResponseTime: number;
  totalResponseSize: number;
  contentType: string;
  hasRequestBody: boolean;
  hasResponseBody: boolean;
  sampleRequestHeaders: Record<string, string>;
  sampleRequestBody?: any;
  sampleResponseBody?: any;
  queryParams: Set<string>;
  pathParams: string[];
  isMutation: boolean;
  isFirstParty: boolean;
}

function generateAPIReport(harPath: string): void {
  console.log('📊 Generating API Report from HAR file...\n');
  console.log(`📁 Input: ${harPath}\n`);
  
  if (!fs.existsSync(harPath)) {
    console.error(`❌ File not found: ${harPath}`);
    process.exit(1);
  }
  
  const harContent = fs.readFileSync(harPath, 'utf-8');
  const harData = JSON.parse(harContent);
  
  // Process HAR using existing pipeline
  processHARComplete(harData, path.basename(harPath))
    .then(({ bundle, catalog, automationGroups }) => {
      console.log(`✅ Processed ${bundle.events.length} events\n`);
      
      // Filter out auth endpoints
      const nonAuthEvents = bundle.events.filter(event => 
        !isAuthEndpoint(event.url, event.path)
      );
      
      console.log(`🔍 Found ${nonAuthEvents.length} non-auth API calls (excluded ${bundle.events.length - nonAuthEvents.length} auth endpoints)\n`);
      
      // Group endpoints by method + normalized path
      const endpointMap = new Map<string, APIEndpoint>();
      
      for (const event of nonAuthEvents) {
        // Skip static assets
        const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ico', '.map', '.json'];
        if (staticExtensions.some(ext => event.path.toLowerCase().endsWith(ext))) {
          continue;
        }
        
        // Skip preflight requests
        if (event.isPreflight) {
          continue;
        }
        
        const normalizedPath = normalizePath(event.path, event.query);
        const key = `${event.method} ${normalizedPath}`;
        
        if (!endpointMap.has(key)) {
          endpointMap.set(key, {
            method: event.method,
            path: event.path,
            normalizedPath,
            host: event.host,
            fullUrl: event.url,
            statusCodes: [],
            requestCount: 0,
            avgResponseTime: 0,
            totalResponseSize: 0,
            contentType: event.contentType || 'unknown',
            hasRequestBody: !!event.requestBody,
            hasResponseBody: !!event.responseBody,
            sampleRequestHeaders: { ...event.requestHeaders },
            sampleRequestBody: event.requestBody?.parsed || event.requestBody?.text,
            sampleResponseBody: event.responseBody?.parsed || event.responseBody?.text,
            queryParams: new Set(Object.keys(event.query)),
            pathParams: [],
            isMutation: event.isMutation,
            isFirstParty: event.isFirstParty,
          });
        }
        
        const endpoint = endpointMap.get(key)!;
        endpoint.requestCount++;
        endpoint.statusCodes.push(event.status);
        endpoint.avgResponseTime += event.wait + event.receive;
        endpoint.totalResponseSize += event.size;
        
        // Update sample if this is a successful request
        if (event.status >= 200 && event.status < 300) {
          if (event.requestBody && !endpoint.sampleRequestBody) {
            endpoint.sampleRequestBody = event.requestBody.parsed || event.requestBody.text;
          }
          if (event.responseBody && !endpoint.sampleResponseBody) {
            endpoint.sampleResponseBody = event.responseBody.parsed || event.responseBody.text;
          }
        }
      }
      
      // Calculate averages
      for (const endpoint of endpointMap.values()) {
        endpoint.avgResponseTime = Math.round(endpoint.avgResponseTime / endpoint.requestCount);
        endpoint.totalResponseSize = Math.round(endpoint.totalResponseSize / endpoint.requestCount);
        endpoint.queryParams = new Set(Array.from(endpoint.queryParams));
      }
      
      // Convert to array and sort by request count
      const endpoints = Array.from(endpointMap.values())
        .sort((a, b) => b.requestCount - a.requestCount);
      
      // Generate report
      const report = {
        metadata: {
          harFile: path.basename(harPath),
          processedAt: new Date().toISOString(),
          totalEvents: bundle.events.length,
          nonAuthEvents: nonAuthEvents.length,
          uniqueEndpoints: endpoints.length,
          firstPartyHosts: bundle.hosts.firstParty,
        },
        endpoints: endpoints.map(e => ({
          method: e.method,
          path: e.path,
          normalizedPath: e.normalizedPath,
          host: e.host,
          fullUrl: e.fullUrl,
          requestCount: e.requestCount,
          statusCodes: [...new Set(e.statusCodes)].sort(),
          avgResponseTime: e.avgResponseTime,
          avgResponseSize: e.totalResponseSize,
          contentType: e.contentType,
          hasRequestBody: e.hasRequestBody,
          hasResponseBody: e.hasResponseBody,
          isMutation: e.isMutation,
          isFirstParty: e.isFirstParty,
          queryParams: Array.from(e.queryParams),
          sampleRequestHeaders: Object.fromEntries(
            Object.entries(e.sampleRequestHeaders).slice(0, 10)
          ),
          sampleRequestBody: e.sampleRequestBody,
          sampleResponseBody: e.sampleResponseBody,
        })),
        summary: {
          byMethod: endpoints.reduce((acc, e) => {
            acc[e.method] = (acc[e.method] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          byHost: endpoints.reduce((acc, e) => {
            acc[e.host] = (acc[e.host] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          mutations: endpoints.filter(e => e.isMutation).length,
          firstParty: endpoints.filter(e => e.isFirstParty).length,
          thirdParty: endpoints.filter(e => !e.isFirstParty).length,
        },
      };
      
      // Output report
      const outputPath = path.join(path.dirname(harPath), 'api-report.json');
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      
      console.log('📄 API Report Generated\n');
      console.log(`📊 Summary:`);
      console.log(`   Total Events: ${report.metadata.totalEvents}`);
      console.log(`   Non-Auth Events: ${report.metadata.nonAuthEvents}`);
      console.log(`   Unique Endpoints: ${report.metadata.uniqueEndpoints}`);
      console.log(`   Mutations: ${report.summary.mutations}`);
      console.log(`   First-Party: ${report.summary.firstParty}`);
      console.log(`   Third-Party: ${report.summary.thirdParty}`);
      console.log(`\n📁 Report saved to: ${outputPath}\n`);
      
      // Print top 20 endpoints
      console.log('🔝 Top 20 Most Called Endpoints:\n');
      endpoints.slice(0, 20).forEach((e, i) => {
        console.log(`${i + 1}. ${e.method} ${e.normalizedPath}`);
        console.log(`   Host: ${e.host}`);
        console.log(`   Calls: ${e.requestCount} | Avg Time: ${e.avgResponseTime}ms | Avg Size: ${(e.totalResponseSize / 1024).toFixed(2)}KB`);
        console.log(`   Status Codes: ${[...new Set(e.statusCodes)].sort().join(', ')}`);
        if (e.isMutation) console.log(`   ⚠️  MUTATION`);
        console.log('');
      });
    })
    .catch((error) => {
      console.error('❌ Error processing HAR:', error);
      process.exit(1);
    });
}

// Run if called directly
if (require.main === module) {
  const harPath = process.argv[2];
  
  if (!harPath) {
    console.error('Usage: tsx scripts/generate-api-report.ts <path-to-har-file>');
    process.exit(1);
  }
  
  try {
    generateAPIReport(harPath);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}
