import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/ai/autonomous-agent
 * 
 * Autonomous AI agent that determines the next action based on complete context:
 * - User goal, constraints, target data
 * - DOM flipbook analysis (page structure, navigation)
 * - API endpoints captured
 * - Previously locked steps
 * - Previous test results (successes and failures)
 * 
 * Returns the next action to take:
 * - test_endpoint: Test a specific endpoint
 * - lock_step: Lock the current successful test
 * - navigate_page: Navigate to a different page
 * - complete: Workflow is complete
 * - wait_for_data: Need more browsing/data
 */
export async function POST(req: NextRequest) {
  try {
    const {
      goal,
      constraints,
      targetData,
      endpoints = [],
      lockedSteps = [],
      flipbookAnalysis = null,
      flipbookSnapshots = [],
      lastTestResult = null,
      conversationHistory = [],
    } = await req.json();

    if (!goal) {
      return NextResponse.json(
        { ok: false, error: 'Goal is required' },
        { status: 400 }
      );
    }

    // Build comprehensive context for AI
    const context = buildAgentContext({
      goal,
      constraints,
      targetData,
      endpoints,
      lockedSteps,
      flipbookAnalysis,
      flipbookSnapshots,
      lastTestResult,
      conversationHistory,
    });

    // Build AI prompt
    const prompt = `You are an autonomous API workflow agent. Your job is to determine the NEXT ACTION to take.

${context}

**Your Task:**
Based on the complete context above, determine the optimal next action.

**Decision Rules:**

1. **If no endpoints captured yet:**
   → Action: wait_for_data
   → Reason: Need user to browse the site first

2. **If flipbook available but not analyzed:**
   → Action: analyze_flipbook
   → Reason: Will reveal page structure and navigation patterns

3. **If no locked steps yet:**
   → Action: test_endpoint
   → Select the most likely first step (usually auth/login)
   → Use flipbook analysis to inform choice

4. **If last test failed with 401/403:**
   → Action: test_endpoint
   → Select authentication endpoint
   → Reason: Need auth before proceeding

5. **If last test succeeded but not locked:**
   → Action: lock_step
   → Reason: Secure the progress

6. **If locked steps exist, need next step:**
   → Action: test_endpoint
   → Select endpoint that depends on previous steps
   → Use extracted variables from locked steps

7. **If target data fully extracted:**
   → Action: complete
   → Reason: Goal achieved

8. **If stuck (3+ consecutive failures):**
   → Action: navigate_page
   → Suggest browsing to different page
   → Or: wait_for_data

**Response Format:**
{
  "action": "test_endpoint" | "lock_step" | "navigate_page" | "analyze_flipbook" | "complete" | "wait_for_data",
  "reasoning": "Clear explanation of why this action",
  "confidence": 0-100,
  "endpoint": {
    "method": "GET",
    "path": "/api/endpoint",
    "headers": { ... },
    "body": { ... },
    "useVariables": ["step1.token", "step2.userId"]
  } | null,
  "playwrightAction": {
    "type": "click" | "scroll" | "navigate",
    "selector": "...",
    "url": "..."
  } | null,
  "nextStepSuggestion": "What should happen after this action succeeds",
  "estimatedStepsRemaining": 1-10,
  "warnings": ["Potential issue 1", "Potential issue 2"]
}`;

    console.log('[Autonomous Agent] Analyzing context...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert autonomous agent for API workflow automation.
          
You make intelligent decisions based on:
- User goals and constraints
- Available API endpoints
- Page structure (from DOM flipbook)
- Previous test results
- Locked workflow steps

You optimize for:
1. Success rate (choose most likely to succeed)
2. Efficiency (minimal steps to goal)
3. Robustness (handle auth, pagination, errors)
4. Learning (adapt based on failures)

You respond ONLY with valid JSON matching the specified format.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4, // Lower temperature for more deterministic decisions
      max_tokens: 2000,
    });

    const decision = JSON.parse(completion.choices[0].message.content || '{}');

    console.log('[Autonomous Agent] Decision:', decision.action, '-', decision.reasoning);

    return NextResponse.json({
      ok: true,
      decision,
      tokensUsed: completion.usage?.total_tokens || 0,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[Autonomous Agent] Error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * Build comprehensive context for AI decision-making
 */
function buildAgentContext(data: any): string {
  const {
    goal,
    constraints,
    targetData,
    endpoints,
    lockedSteps,
    flipbookAnalysis,
    flipbookSnapshots,
    lastTestResult,
    conversationHistory,
  } = data;

  let context = `# CURRENT STATE\n\n`;

  // Goal & Constraints
  context += `**Goal**: ${goal}\n`;
  if (constraints) context += `**Constraints**: ${constraints}\n`;
  if (targetData) context += `**Target Data**: ${targetData}\n`;
  context += `\n`;

  // Locked Steps Progress
  context += `**Locked Steps**: ${lockedSteps.length}\n`;
  if (lockedSteps.length > 0) {
    context += `\nCompleted Steps:\n`;
    lockedSteps.forEach((step: any) => {
      context += `${step.stepNumber}. ${step.method} ${step.endpoint}\n`;
      if (step.extractedVars && Object.keys(step.extractedVars).length > 0) {
        context += `   Variables: ${Object.keys(step.extractedVars).join(', ')}\n`;
      }
    });
    context += `\n`;
  }

  // Available Endpoints
  context += `**Available Endpoints**: ${endpoints.length}\n`;
  if (endpoints.length > 0) {
    context += `\nTop Endpoints:\n`;
    endpoints.slice(0, 10).forEach((ep: any) => {
      context += `- ${ep.method} ${ep.host}${ep.path}`;
      if (ep.hasAuth) context += ` (requires auth)`;
      context += `\n`;
    });
    context += `\n`;
  }

  // Flipbook Analysis
  if (flipbookAnalysis) {
    context += `**DOM Flipbook Analysis**:\n`;
    context += `- Navigation: ${flipbookAnalysis.navigationPattern?.type || 'unknown'}\n`;
    if (flipbookAnalysis.contentStructure) {
      context += `- Content Selector: ${flipbookAnalysis.contentStructure.selector}\n`;
    }
    if (flipbookAnalysis.workflowSteps && flipbookAnalysis.workflowSteps.length > 0) {
      context += `- Suggested Steps: ${flipbookAnalysis.workflowSteps.length}\n`;
    }
    context += `- Confidence: ${flipbookAnalysis.confidence || 0}%\n\n`;
  } else if (flipbookSnapshots.length > 0) {
    context += `**DOM Snapshots**: ${flipbookSnapshots.length} captured (not yet analyzed)\n\n`;
  }

  // Last Test Result
  if (lastTestResult) {
    context += `**Last Test Result**:\n`;
    if (lastTestResult.success) {
      context += `✅ SUCCESS: ${lastTestResult.status} ${lastTestResult.statusText}\n`;
      if (lastTestResult.extractedVars) {
        context += `   Variables: ${Object.keys(lastTestResult.extractedVars).join(', ')}\n`;
      }
    } else {
      context += `❌ FAILED: ${lastTestResult.status || 'error'}\n`;
      context += `   Error: ${lastTestResult.error || 'Unknown error'}\n`;
    }
    context += `\n`;
  }

  // Conversation History (recent failures/successes)
  if (conversationHistory.length > 0) {
    const recentFailures = conversationHistory
      .filter((h: any) => h.outcome === 'failed')
      .slice(-3);
    
    if (recentFailures.length > 0) {
      context += `**Recent Failures** (${recentFailures.length}):\n`;
      recentFailures.forEach((h: any) => {
        context += `- ${h.action}\n`;
      });
      context += `\n`;
    }
  }

  return context;
}
