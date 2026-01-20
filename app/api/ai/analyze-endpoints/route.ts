import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { 
      goal, 
      constraints, 
      targetData,
      endpoints,
      lockedSteps = [],
      currentStepNumber = 1
    } = await req.json();

    // Build context from locked steps
    const lockedStepsContext = lockedSteps.length > 0 
      ? `\n\nLOCKED STEPS (Already Working):\n${lockedSteps.map((s: any) => `
Step ${s.stepNumber}: ${s.method} ${s.endpoint}
Status: SUCCESS
Extracted Variables: ${JSON.stringify(s.extractedVars || {})}
Dependencies: ${s.dependencies?.join(', ') || 'none'}`).join('\n')}`
      : '\n\nNo steps locked yet. This is the first step.';

    const availableVariables = lockedSteps.reduce((acc: string[], step: any) => {
      if (step.extractedVars) {
        Object.keys(step.extractedVars).forEach(key => {
          acc.push(`step${step.stepNumber}.${key}`);
        });
      }
      return acc;
    }, []);

    const variablesContext = availableVariables.length > 0
      ? `\n\nAVAILABLE VARIABLES (from previous steps):\n${availableVariables.map(v => `- {{${v}}}`).join('\n')}`
      : '';

    const prompt = `You are an expert API reverse engineering assistant helping build a step-by-step workflow.

USER GOAL: ${goal || 'Not specified'}
CONSTRAINTS: ${constraints || 'None'}
TARGET DATA STRUCTURE: ${targetData || 'Not specified'}
${lockedStepsContext}${variablesContext}

CAPTURED ENDPOINTS (recent network traffic):
${JSON.stringify(endpoints.slice(0, 20).map((ep: any) => ({
  method: ep.method,
  host: ep.host,
  path: ep.path,
  hasAuth: ep.hasAuth,
  count: ep.count,
  statuses: ep.statuses,
  sampleHeaders: ep.sampleHeaders
})), null, 2)}

TASK: 
${lockedSteps.length === 0 
  ? 'Analyze the captured traffic and suggest the FIRST step to achieve the user\'s goal.'
  : `The user has locked ${lockedSteps.length} step(s). Suggest the NEXT step (Step ${currentStepNumber}) to continue toward the goal.`
}

Consider:
1. What data do we still need to achieve the goal?
2. Which endpoint logically comes next?
3. Does it need data from previous steps?
4. Are there any auth/permission requirements?

IMPORTANT: Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "suggestedStep": {
    "stepNumber": ${currentStepNumber},
    "endpoint": "string (e.g., /api/products)",
    "method": "string (e.g., GET)",
    "reason": "string (why this step is next)",
    "usesVariables": ["array of variables it needs, e.g., step1.token"],
    "expectedResult": "string (what data this will return)"
  },
  "insights": ["array of observations"],
  "alternatives": [
    {
      "endpoint": "string",
      "method": "string",
      "reason": "string"
    }
  ],
  "confidence": 0.85
}`;

    console.log('[AI] Sending prompt to OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert API reverse engineer. Always respond with valid JSON only, no markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content;
    console.log('[AI] Response received:', content);

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const analysis = JSON.parse(content);

    return NextResponse.json({
      ok: true,
      analysis,
      tokensUsed: completion.usage?.total_tokens || 0,
    });

  } catch (err) {
    console.error('[AI] Error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
