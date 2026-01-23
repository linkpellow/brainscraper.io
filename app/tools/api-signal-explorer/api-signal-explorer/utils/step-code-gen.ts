/**
 * Utility to generate code snippets from pipeline candidate steps
 */

import type { PipelineCandidateStep } from '@/src/tools/api-signal-explorer/pipeline-candidate';

export type CodeLang = 'curl' | 'fetch' | 'axios' | 'python';

export function generateCodeForStep(step: PipelineCandidateStep, lang: CodeLang = 'fetch'): string {
  const primaryEvent = step.correlatedEvents[0];
  if (!primaryEvent) {
    return '// No network events for this step';
  }

  const method = primaryEvent.method;
  const url = primaryEvent.url;
  const headers = primaryEvent.reqHeaders || {};
  
  switch (lang) {
    case 'curl': {
      const headerFlags = Object.entries(headers)
        .map(([k, v]) => `  -H '${k}: ${v}'`)
        .join(' \\\n');
      const bodyFlag = primaryEvent.reqBodyText
        ? `  -d '${primaryEvent.reqBodyText.substring(0, 200)}${primaryEvent.reqBodyText.length > 200 ? '...' : ''}'`
        : '';
      return `curl -X ${method} '${url}'${headerFlags ? ' \\\n' + headerFlags : ''}${bodyFlag ? ' \\\n' + bodyFlag : ''}`;
    }
    
    case 'fetch': {
      const headersStr = Object.keys(headers).length > 0
        ? ',\n  headers: ' + JSON.stringify(headers, null, 2).split('\n').join('\n  ')
        : '';
      const body = primaryEvent.reqBodyText
        ? `,\n  body: ${JSON.stringify(primaryEvent.reqBodyText)}`
        : '';
      return `fetch('${url}', {\n  method: '${method}'${headersStr}${body}\n})\n  .then(res => res.json())\n  .then(data => console.log(data))\n  .catch(err => console.error(err));`;
    }
    
    case 'axios': {
      const config = Object.keys(headers).length > 0
        ? `,\n  {\n    headers: ${JSON.stringify(headers, null, 4).split('\n').join('\n    ')}\n  }`
        : '';
      if (method === 'GET') {
        return `axios.get('${url}'${config});`;
      }
      const bodyParam = primaryEvent.reqBodyText
        ? `\n  ${JSON.stringify(JSON.parse(primaryEvent.reqBodyText) || primaryEvent.reqBodyText)}`
        : '';
      return `axios.${method.toLowerCase()}('${url}'${bodyParam}${config});`;
    }
    
    case 'python': {
      const headersStr = Object.entries(headers)
        .map(([k, v]) => `    '${k}': '${v}'`)
        .join(',\n');
      const dataParam = primaryEvent.reqBodyText
        ? `\n  json=${JSON.stringify(JSON.parse(primaryEvent.reqBodyText) || primaryEvent.reqBodyText)}`
        : '';
      return `import requests\n\nresponse = requests.${method.toLowerCase()}(\n  '${url}',${dataParam}\n  headers={\n${headersStr}\n  }\n)\nprint(response.json())`;
    }
  }
}
