/**
 * Code Preview Panel - Shows generated code for a candidate step
 */

import { useState } from 'react';
import { Copy, Code, Check } from 'lucide-react';
import type { PipelineCandidateStep } from '@/src/tools/api-signal-explorer/pipeline-candidate';

type CodePreviewPanelProps = {
  step: PipelineCandidateStep | null;
  onClose?: () => void;
};

type CodeLang = 'curl' | 'fetch' | 'axios' | 'python';

export default function CodePreviewPanel({ step, onClose }: CodePreviewPanelProps) {
  const [lang, setLang] = useState<CodeLang>('fetch');
  const [copied, setCopied] = useState(false);

  if (!step) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">
        Select a step to preview code
      </div>
    );
  }

  const primaryEvent = step.correlatedEvents[0];
  if (!primaryEvent) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">
        No network events for this step
      </div>
    );
  }

  // Generate code based on selected language
  const generateCode = (): string => {
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
  };

  const code = generateCode();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const langs: { value: CodeLang; label: string }[] = [
    { value: 'curl', label: 'cURL' },
    { value: 'fetch', label: 'Fetch' },
    { value: 'axios', label: 'Axios' },
    { value: 'python', label: 'Python' },
  ];

  return (
    <div className="flex flex-col h-full bg-black/40 border-l border-white/[0.06]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Code className="w-5 h-5 text-purple-400" />
          <h3 className="text-[11px] font-black tracking-[0.3em] text-white/20 uppercase">Code Preview</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/20 hover:text-white/40 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Step Info */}
      <div className="px-6 py-3 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="text-xs font-bold text-white/90 mb-1">
          {step.action.label || step.action.type}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/40">
          <span>{primaryEvent.method}</span>
          <span>·</span>
          <span className="truncate max-w-[300px]">{primaryEvent.host}{primaryEvent.path}</span>
        </div>
      </div>

      {/* Language Selector */}
      <div className="px-6 py-3 border-b border-white/[0.06] flex items-center gap-2">
        {langs.map((l) => (
          <button
            key={l.value}
            onClick={() => setLang(l.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              lang === l.value
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-white/[0.05] text-white/40 hover:bg-white/[0.08] hover:text-white/60'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Code Block */}
      <div className="flex-1 overflow-auto p-6 relative">
        <pre className="text-xs font-mono text-white/80 leading-relaxed whitespace-pre-wrap">
          <code>{code}</code>
        </pre>
        
        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="absolute top-6 right-6 px-3 py-2 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] rounded-lg text-xs font-bold text-white/60 hover:text-white/90 transition-all flex items-center gap-2"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Variables Hint */}
      {step.extractedVariables && Object.keys(step.extractedVariables).length > 0 && (
        <div className="px-6 py-3 border-t border-white/[0.06] bg-purple-500/5">
          <div className="text-[10px] font-bold text-purple-400 mb-1">Extracted Variables:</div>
          <div className="text-[10px] text-white/40 font-mono">
            {Object.keys(step.extractedVariables).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}
