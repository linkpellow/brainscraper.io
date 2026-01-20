import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'dom-snapshots');

/**
 * POST /api/ai/analyze-dom-flipbook
 * 
 * Analyzes DOM snapshots with AI to understand page structure, navigation patterns,
 * and optimal workflow steps.
 * 
 * Body:
 * {
 *   sessionId: string;
 *   goal: string;
 *   targetData: string;
 *   snapshotIds?: string[];  // Specific snapshots, or all if not provided
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, goal, targetData, snapshotIds } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'sessionId required' },
        { status: 400 }
      );
    }

    // Load session index
    const sessionDir = path.join(SNAPSHOTS_DIR, sessionId);
    const indexPath = path.join(sessionDir, '_index.json');
    const indexData = await readFile(indexPath, 'utf-8').catch(() => '[]');
    const index = JSON.parse(indexData);

    if (index.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'No snapshots found for this session',
      });
    }

    // Filter to specific snapshots if provided
    const snapshotsToAnalyze = snapshotIds
      ? index.filter((s: any) => snapshotIds.includes(s.id))
      : index;

    // Load full snapshots (limit to prevent token overflow)
    const maxSnapshots = 5;
    const snapshots = [];
    for (const meta of snapshotsToAnalyze.slice(0, maxSnapshots)) {
      try {
        const data = await readFile(meta.filepath, 'utf-8');
        const snapshot = JSON.parse(data);
        snapshots.push(snapshot);
      } catch {
        console.warn('[AI FlipBook] Could not load snapshot:', meta.id);
      }
    }

    // Build LLM-friendly summary of snapshots
    const snapshotSummary = snapshots.map((snap, idx) => {
      return `
## Snapshot ${idx + 1}: ${snap.url}
**Title**: ${snap.title}
**Timestamp**: ${new Date(snap.timestamp).toISOString()}
**Scroll Position**: y=${snap.scrollPosition.y}, viewport=${snap.viewport.height}
**Document Size**: ${snap.document.width}x${snap.document.height}

### Page Structure:
- **Content Items**: ${snap.metadata.contentItems?.length || 0} detected
${snap.metadata.contentItems?.slice(0, 5).map((item: any) => `  - ${item.selector}: "${item.text.slice(0, 50)}..."`).join('\n') || ''}

- **Pagination**: ${snap.metadata.pagination?.length || 0} elements
${snap.metadata.pagination?.slice(0, 3).map((p: any) => `  - ${p.text} (${p.type}, ${p.href || 'no href'})`).join('\n') || ''}

- **Navigation**: ${snap.metadata.navigation?.length || 0} links
${snap.metadata.navigation?.slice(0, 5).map((nav: any) => `  - ${nav.text}: ${nav.href}`).join('\n') || ''}

- **Forms**: ${snap.metadata.forms?.length || 0} detected
${snap.metadata.forms?.map((f: any) => `  - ${f.method?.toUpperCase() || 'GET'} ${f.action || '(no action)'} (${f.inputCount} inputs)`).join('\n') || ''}

- **Media**: ${snap.metadata.mediaCount?.images || 0} images, ${snap.metadata.mediaCount?.videos || 0} videos

- **Infinite Scroll**: ${snap.metadata.hasInfiniteScroll ? 'Yes' : 'No'}

### Key DOM Elements (Visible):
${extractKeyElements(snap.dom).slice(0, 10).join('\n')}

### Changes Since Last: ${snap.changes} mutations
      `.trim();
    }).join('\n\n---\n\n');

    // Build AI prompt
    const prompt = `You are analyzing DOM snapshots from a web scraping session to help build an API workflow.

**User Goal**: ${goal || 'Not specified'}
**Target Data**: ${targetData || 'Not specified'}

**Session Overview**:
- Total snapshots: ${snapshots.length}
- URLs captured: ${[...new Set(snapshots.map(s => s.url))].join(', ')}

${snapshotSummary}

**Your Task**:
Analyze these snapshots and provide:

1. **Navigation Pattern**: How does pagination work? (links, buttons, infinite scroll)
2. **Content Structure**: Where is the target data located in the DOM? (selectors, patterns)
3. **Workflow Steps**: What actions are needed to collect all data? (clicks, scrolls, waits)
4. **Playwright Code**: Generate Playwright automation code to navigate and extract data
5. **Data Extraction**: Provide CSS/XPath selectors for target fields
6. **Edge Cases**: Identify potential issues (lazy loading, rate limits, auth)

Respond in JSON format:
{
  "navigationPattern": { "type": "pagination|infinite|manual", "details": "..." },
  "contentStructure": { "selector": "...", "dataFields": [...] },
  "workflowSteps": [ { "step": 1, "action": "...", "selector": "...", "wait": "..." } ],
  "playwrightCode": "...",
  "dataExtraction": { "selectors": {...}, "xpath": {...} },
  "edgeCases": [...],
  "confidence": 0-100
}`;

    console.log('[AI FlipBook] Analyzing', snapshots.length, 'snapshots...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing web page structure and creating automated scraping workflows. You understand DOM patterns, pagination, and data extraction techniques.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 3000,
    });

    const analysis = JSON.parse(completion.choices[0].message.content || '{}');

    return NextResponse.json({
      ok: true,
      analysis,
      snapshotsAnalyzed: snapshots.length,
      tokensUsed: completion.usage?.total_tokens || 0,
    });
  } catch (err) {
    console.error('[AI FlipBook] Error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * Extract key visible elements from DOM tree
 */
function extractKeyElements(dom: any, depth = 0): string[] {
  if (!dom || depth > 10) return [];
  
  const elements: string[] = [];
  
  if (dom.position?.visible || dom.position?.inViewport) {
    const desc = `${' '.repeat(depth * 2)}<${dom.tag}${dom.id ? '#' + dom.id : ''}${dom.classes?.length ? '.' + dom.classes.slice(0, 2).join('.') : ''}>`;
    if (dom.text && dom.text.length > 0) {
      elements.push(`${desc} "${dom.text.slice(0, 50)}${dom.text.length > 50 ? '...' : ''}"`);
    } else if (dom.attributes?.href) {
      elements.push(`${desc} href="${dom.attributes.href}"`);
    } else {
      elements.push(desc);
    }
  }
  
  if (dom.children && Array.isArray(dom.children)) {
    for (const child of dom.children) {
      elements.push(...extractKeyElements(child, depth + 1));
    }
  }
  
  return elements;
}
