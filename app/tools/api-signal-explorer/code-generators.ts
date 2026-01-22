/**
 * Code generation utilities for converting endpoints to various code snippets
 */

import type { EndpointData } from './types';

/**
 * Generate a curl command from endpoint data
 */
export function generateCurl(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const headerFlags = Object.entries(headers)
    .map(([k, v]) => `  -H '${k}: ${v}'`)
    .join(' \\\n');
  
  const dataFlag = endpoint.sampleReqBody 
    ? `  -d '${endpoint.sampleReqBody.substring(0, 100)}${endpoint.sampleReqBody.length > 100 ? '...' : ''}'`
    : '';
  
  return `curl -X ${endpoint.method} '${endpoint.sampleUrl}'${headerFlags ? ' \\\n' + headerFlags : ''}${dataFlag ? ' \\\n' + dataFlag : ''}`;
}

/**
 * Generate a fetch API call from endpoint data
 */
export function generateFetch(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const headersStr = Object.keys(headers).length > 0 
    ? ',\n  headers: ' + JSON.stringify(headers, null, 2).split('\n').join('\n  ')
    : '';
  
  const body = endpoint.sampleReqBody 
    ? `,\n  body: JSON.stringify(${endpoint.sampleReqBody.substring(0, 50)}...)`
    : '';
  
  return `fetch('${endpoint.sampleUrl}', {\n  method: '${endpoint.method}'${headersStr}${body}\n})\n  .then(res => res.json())\n  .then(data => console.log(data));`;
}

/**
 * Generate an axios call from endpoint data
 */
export function generateAxios(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const config = `{\n  headers: ${JSON.stringify(headers, null, 2).split('\n').join('\n  ')}\n}`;
  
  if (endpoint.method === 'GET') {
    return `axios.get('${endpoint.sampleUrl}', ${config});`;
  }
  return `axios.${endpoint.method.toLowerCase()}('${endpoint.sampleUrl}', data, ${config});`;
}

/**
 * Generate a Python requests call from endpoint data
 */
export function generatePython(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const headersStr = Object.entries(headers).map(([k, v]) => `    '${k}': '${v}'`).join(',\n');
  
  return `import requests\n\nresponse = requests.${endpoint.method.toLowerCase()}(\n  '${endpoint.sampleUrl}',\n  headers={\n${headersStr}\n  }\n)\nprint(response.json())`;
}
