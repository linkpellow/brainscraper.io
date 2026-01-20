import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const { 
      code,           // The code snippet to execute
      language,       // 'curl' | 'fetch' | 'axios' | 'python'
      variables = {}  // Variables from previous steps
    } = await req.json();

    console.log(`[Execute] Running ${language} snippet...`);

    // Parse the code and extract request details
    let result;

    if (language === 'curl') {
      result = await executeCurl(code, variables);
    } else if (language === 'fetch' || language === 'axios') {
      result = await executeJavaScript(code, variables);
    } else if (language === 'python') {
      // For Python, we'd need a Python runtime - for now, just parse and execute as HTTP
      result = await parsePythonAndExecute(code, variables);
    } else {
      throw new Error(`Unsupported language: ${language}`);
    }

    return NextResponse.json({
      ok: true,
      result,
    });

  } catch (err) {
    console.error('[Execute] Error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// Execute a curl command
async function executeCurl(code: string, variables: Record<string, any>): Promise<any> {
  // Replace variables in code
  let processedCode = code;
  Object.entries(variables).forEach(([key, value]) => {
    processedCode = processedCode.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  });

  // Parse curl command
  const methodMatch = processedCode.match(/-X\s+(\w+)/);
  const urlMatch = processedCode.match(/curl\s+(?:-X\s+\w+\s+)?'?([^'\s]+)'?/);
  const headersMatches = [...processedCode.matchAll(/-H\s+'([^']+)'/g)];
  const dataMatch = processedCode.match(/-d\s+'([^']+)'/);

  if (!urlMatch) {
    throw new Error('Could not parse URL from curl command');
  }

  const method = methodMatch ? methodMatch[1] : 'GET';
  const url = urlMatch[1];
  const headers: Record<string, string> = {};
  
  headersMatches.forEach(match => {
    const [key, value] = match[1].split(':').map(s => s.trim());
    if (key && value) headers[key] = value;
  });

  const data = dataMatch ? dataMatch[1] : undefined;

  // Execute request
  const response = await axios({
    method: method as any,
    url,
    headers,
    data: data ? JSON.parse(data) : undefined,
    validateStatus: () => true, // Don't throw on any status
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body: response.data,
    success: response.status >= 200 && response.status < 300,
  };
}

// Execute JavaScript (fetch/axios)
async function executeJavaScript(code: string, variables: Record<string, any>): Promise<any> {
  // Replace variables
  let processedCode = code;
  Object.entries(variables).forEach(([key, value]) => {
    processedCode = processedCode.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  });

  // Extract fetch/axios details
  const urlMatch = processedCode.match(/(?:fetch|axios\.(?:get|post|put|delete))\s*\(\s*'([^']+)'/);
  const methodMatch = processedCode.match(/method:\s*'(\w+)'/);
  
  if (!urlMatch) {
    throw new Error('Could not parse URL from JavaScript code');
  }

  const url = urlMatch[1];
  const method = methodMatch ? methodMatch[1] : 'GET';

  // Execute request
  const response = await axios({
    method: method as any,
    url,
    validateStatus: () => true,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body: response.data,
    success: response.status >= 200 && response.status < 300,
  };
}

// Parse Python requests code and execute
async function parsePythonAndExecute(code: string, variables: Record<string, any>): Promise<any> {
  // Replace variables
  let processedCode = code;
  Object.entries(variables).forEach(([key, value]) => {
    processedCode = processedCode.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  });

  // Extract URL and method from Python requests code
  const methodMatch = processedCode.match(/requests\.(\w+)\s*\(/);
  const urlMatch = processedCode.match(/requests\.\w+\s*\(\s*'([^']+)'/);

  if (!urlMatch || !methodMatch) {
    throw new Error('Could not parse Python requests code');
  }

  const method = methodMatch[1].toUpperCase();
  const url = urlMatch[1];

  // Execute request
  const response = await axios({
    method: method as any,
    url,
    validateStatus: () => true,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body: response.data,
    success: response.status >= 200 && response.status < 300,
  };
}
