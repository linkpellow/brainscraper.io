/**
 * Complete Credential Harvesting Script
 * 
 * Comprehensive script that harvests credentials from:
 * 1. HAR files (network traffic)
 * 2. Environment variables
 * 3. Code files (hardcoded secrets)
 * 4. Configuration files
 * 
 * Usage:
 *   npx tsx scripts/harvest-credentials-complete.ts [har-file-path]
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface Credential {
  source: string;
  type: string;
  key: string;
  value: string;
  location?: string;
  timestamp?: string;
}

interface HarvestResults {
  timestamp: string;
  harCredentials: Credential[];
  envCredentials: Credential[];
  codeCredentials: Credential[];
  configCredentials: Credential[];
  allCredentials: Credential[];
  summary: {
    total: number;
    tokens: number;
    apiKeys: number;
    secrets: number;
  };
}

function harvestFromHAR(harPath?: string): Credential[] {
  const credentials: Credential[] = [];
  
  const defaultHarPath = path.join(process.cwd(), 'utils/brainscraper.io.har');
  const targetHar = harPath || defaultHarPath;
  
  if (!fs.existsSync(targetHar)) {
    console.log(`⚠️  HAR file not found: ${targetHar}`);
    return credentials;
  }

  try {
    const harContent = fs.readFileSync(targetHar, 'utf-8');
    const har = JSON.parse(harContent);

    har.log.entries.forEach((entry: any) => {
      // Extract from headers
      entry.request.headers?.forEach((header: any) => {
        const name = header.name.toLowerCase();
        if (name === 'authorization' || name.includes('api-key') || name.includes('token')) {
          const value = header.value.replace(/^Bearer\s+/i, '');
          if (value.length > 10) {
            credentials.push({
              source: 'har_request_header',
              type: name.includes('api-key') ? 'api_key' : 'token',
              key: header.name,
              value: value,
              location: entry.request.url
            });
          }
        }
      });

      // Extract from response body
      if (entry.response.content?.text) {
        try {
          const body = JSON.parse(entry.response.content.text);
          if (body.token || body.data?.token || body.jwt) {
            const token = body.token || body.data?.token || body.jwt;
            credentials.push({
              source: 'har_response_body',
              type: 'token',
              key: 'token',
              value: token,
              location: entry.request.url
            });
          }
        } catch (e) {
          // Not JSON
        }
      }
    });
  } catch (e) {
    console.error(`❌ Error parsing HAR: ${e}`);
  }

  return credentials;
}

function harvestFromEnvironment(): Credential[] {
  const credentials: Credential[] = [];
  const envVars = [
    'RAPIDAPI_KEY',
    'USHA_JWT_TOKEN',
    'TELNYX_API_KEY',
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',
    'NEXT_PUBLIC_BASE_URL'
  ];

  envVars.forEach(key => {
    const value = process.env[key];
    if (value) {
      credentials.push({
        source: 'environment_variable',
        type: key.includes('TOKEN') || key.includes('JWT') ? 'token' : 'api_key',
        key: key,
        value: value,
        location: '.env or system environment'
      });
    }
  });

  return credentials;
}

function harvestFromCode(): Credential[] {
  const credentials: Credential[] = [];
  
  // Check for hardcoded secrets in code
  const codeFiles = [
    'utils/getUshaToken.ts',
    'utils/rapidapi.ts',
    'app/api/**/*.ts'
  ];

  // Look for common patterns
  const patterns = [
    /(?:api[_-]?key|token|secret|password)\s*[=:]\s*['"]([^'"]{10,})['"]/gi,
    /(?:API[_-]?KEY|TOKEN|SECRET)\s*[=:]\s*['"]([^'"]{10,})['"]/gi,
    /Bearer\s+([A-Za-z0-9\-_\.]{20,})/gi
  ];

  function searchFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      patterns.forEach(pattern => {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].length > 10) {
            credentials.push({
              source: 'code_file',
              type: 'hardcoded_secret',
              key: 'extracted',
              value: match[1],
              location: filePath
            });
          }
        }
      });
    } catch (e) {
      // Ignore
    }
  }

  // Search specific files
  const filesToCheck = [
    'utils/getUshaToken.ts'
  ];

  filesToCheck.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    searchFile(fullPath);
  });

  return credentials;
}

function harvestFromConfig(): Credential[] {
  const credentials: Credential[] = [];
  
  const configFiles = [
    '.env.local',
    '.env',
    'railway.toml',
    'railway.json'
  ];

  configFiles.forEach(configFile => {
    const configPath = path.join(process.cwd(), configFile);
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach(line => {
          const match = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
          if (match) {
            const key = match[1];
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            
            if ((key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET')) && 
                value.length > 10) {
              credentials.push({
                source: 'config_file',
                type: key.includes('TOKEN') || key.includes('JWT') ? 'token' : 'api_key',
                key: key,
                value: value,
                location: configFile
              });
            }
          }
        });
      } catch (e) {
        // Ignore
      }
    }
  });

  return credentials;
}

function displayResults(results: HarvestResults): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 COMPLETE CREDENTIAL HARVEST RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`📊 Summary:`);
  console.log(`   Total credentials: ${results.summary.total}`);
  console.log(`   Tokens: ${results.summary.tokens}`);
  console.log(`   API Keys: ${results.summary.apiKeys}`);
  console.log(`   Secrets: ${results.summary.secrets}\n`);

  console.log(`📁 Sources:`);
  console.log(`   HAR file: ${results.harCredentials.length} credentials`);
  console.log(`   Environment: ${results.envCredentials.length} credentials`);
  console.log(`   Code files: ${results.codeCredentials.length} credentials`);
  console.log(`   Config files: ${results.configCredentials.length} credentials\n`);

  if (results.allCredentials.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 ALL CREDENTIALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    results.allCredentials.forEach((cred, index) => {
      console.log(`${index + 1}. ${cred.type.toUpperCase()} (${cred.source})`);
      console.log(`   Key: ${cred.key}`);
      console.log(`   Location: ${cred.location || 'N/A'}`);
      console.log(`   Value: ${cred.value.substring(0, 50)}${cred.value.length > 50 ? '...' : ''}`);
      console.log('');
    });
  }
}

// Main execution
const harPath = process.argv[2];

console.log('🔍 Starting complete credential harvest...\n');

const harCredentials = harvestFromHAR(harPath);
const envCredentials = harvestFromEnvironment();
const codeCredentials = harvestFromCode();
const configCredentials = harvestFromConfig();

const allCredentials = [
  ...harCredentials,
  ...envCredentials,
  ...codeCredentials,
  ...configCredentials
];

// Remove duplicates
const uniqueCredentials = Array.from(
  new Map(allCredentials.map(c => [c.value, c])).values()
);

const tokens = uniqueCredentials.filter(c => c.type === 'token');
const apiKeys = uniqueCredentials.filter(c => c.type === 'api_key');
const secrets = uniqueCredentials.filter(c => c.type === 'hardcoded_secret');

const results: HarvestResults = {
  timestamp: new Date().toISOString(),
  harCredentials,
  envCredentials,
  codeCredentials,
  configCredentials,
  allCredentials: uniqueCredentials,
  summary: {
    total: uniqueCredentials.length,
    tokens: tokens.length,
    apiKeys: apiKeys.length,
    secrets: secrets.length
  }
};

displayResults(results);

// Save results
const outputPath = path.join(process.cwd(), 'harvested-credentials-complete.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\n💾 Complete results saved to: ${outputPath}\n`);
