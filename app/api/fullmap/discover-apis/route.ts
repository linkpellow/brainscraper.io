import { NextRequest, NextResponse } from 'next/server';
import { discoverAPIs, generateAPICall, type NetworkEvent } from '@/src/tools/api-signal-explorer/api-discovery';

/**
 * POST /api/fullmap/discover-apis
 * 
 * Analyzes network traffic to identify real backend APIs vs form submissions
 * Priority 1: Find direct API calls to bypass form interaction
 * 
 * @param networkEvents - Captured network events from session
 * @returns API discovery results with recommendation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { networkEvents } = body;

    if (!networkEvents || !Array.isArray(networkEvents)) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid networkEvents array' },
        { status: 400 }
      );
    }

    console.log(`[API Discovery] Analyzing ${networkEvents.length} network events...`);

    // Run API discovery
    const discovery = discoverAPIs(networkEvents);

    // Generate API calls for direct APIs
    const apiCalls = discovery.directAPIs.map(endpoint => ({
      endpoint,
      curlCommand: generateAPICall(endpoint),
      jsCode: generateJavaScriptCode(endpoint),
      pythonCode: generatePythonCode(endpoint)
    }));

    console.log(`[API Discovery] Results:`);
    console.log(`  - Direct APIs found: ${discovery.directAPIs.length}`);
    console.log(`  - Form endpoints: ${discovery.formEndpoints.length}`);
    console.log(`  - Recommendation: ${discovery.recommendation}`);

    return NextResponse.json({
      ok: true,
      discovery,
      apiCalls,
      summary: {
        directAPIs: discovery.directAPIs.length,
        formEndpoints: discovery.formEndpoints.length,
        apiCallProbability: Math.round(discovery.apiCallProbability * 100),
        recommendation: discovery.recommendation,
        topAPI: discovery.directAPIs[0] || null
      }
    });

  } catch (err) {
    console.error('[API Discovery] Error:', err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err instanceof Error ? err.message : 'API discovery failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * Generate JavaScript fetch code for an API endpoint
 */
function generateJavaScriptCode(endpoint: any): string {
  const params = endpoint.parameters.filter((p: any) => p.type === 'body');
  const bodyObj: any = {};
  params.forEach((p: any) => {
    bodyObj[p.name] = p.exampleValue || 'YOUR_VALUE';
  });

  let code = `// ${endpoint.method} ${endpoint.path}\n`;
  code += `const response = await fetch('${endpoint.url}', {\n`;
  code += `  method: '${endpoint.method}',\n`;
  code += `  headers: {\n`;
  code += `    'Content-Type': 'application/json',\n`;

  if (endpoint.authentication?.type === 'bearer') {
    code += `    '${endpoint.authentication.headerName}': 'Bearer YOUR_TOKEN',\n`;
  } else if (endpoint.authentication?.type === 'cookie') {
    code += `    'Cookie': '${endpoint.authentication.cookieNames.join('=YOUR_VALUE; ')}=YOUR_VALUE',\n`;
  }

  code += `  },\n`;

  if (Object.keys(bodyObj).length > 0) {
    code += `  body: JSON.stringify(${JSON.stringify(bodyObj, null, 4).replace(/^/gm, '    ')})\n`;
  }

  code += `});\n\n`;
  code += `const data = await response.json();\n`;
  code += `console.log(data);`;

  return code;
}

/**
 * Generate Python requests code for an API endpoint
 */
function generatePythonCode(endpoint: any): string {
  const params = endpoint.parameters.filter((p: any) => p.type === 'body');
  const bodyObj: any = {};
  params.forEach((p: any) => {
    bodyObj[p.name] = p.exampleValue || 'YOUR_VALUE';
  });

  let code = `# ${endpoint.method} ${endpoint.path}\n`;
  code += `import requests\n\n`;

  code += `headers = {\n`;
  code += `    'Content-Type': 'application/json',\n`;

  if (endpoint.authentication?.type === 'bearer') {
    code += `    '${endpoint.authentication.headerName}': 'Bearer YOUR_TOKEN',\n`;
  } else if (endpoint.authentication?.type === 'cookie') {
    code += `    'Cookie': '${endpoint.authentication.cookieNames.join('=YOUR_VALUE; ')}=YOUR_VALUE',\n`;
  }

  code += `}\n\n`;

  if (Object.keys(bodyObj).length > 0) {
    code += `data = ${JSON.stringify(bodyObj, null, 4).replace(/^/gm, '    ')}\n\n`;
  }

  code += `response = requests.${endpoint.method.toLowerCase()}(\n`;
  code += `    '${endpoint.url}',\n`;
  code += `    headers=headers,\n`;

  if (Object.keys(bodyObj).length > 0) {
    code += `    json=data\n`;
  }

  code += `)\n\n`;
  code += `print(response.json())`;

  return code;
}
