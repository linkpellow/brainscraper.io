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
    } = await req.json();

    const prompt = `You are an expert API workflow architect. Generate a complete multi-step workflow plan.

USER GOAL: ${goal || 'Not specified'}
CONSTRAINTS: ${constraints || 'None'}
TARGET DATA STRUCTURE: ${targetData || 'Not specified'}

AVAILABLE ENDPOINTS (from captured traffic):
${JSON.stringify(endpoints.slice(0, 30).map((ep: any) => ({
  method: ep.method,
  path: ep.path,
  hasAuth: ep.hasAuth,
  count: ep.count,
})), null, 2)}

TASK: Create a complete workflow plan with all steps needed to achieve the goal.

Consider:
1. **Authentication**: Do we need to login first?
2. **Prerequisites**: Are there any required setup steps?
3. **Main Operations**: What's the core sequence?
4. **Pagination**: Do we need to iterate?
5. **Error Handling**: What could go wrong?
6. **Optimization**: Can any steps run in parallel?

IMPORTANT: Return ONLY valid JSON (no markdown) in this exact format:
{
  "workflow": {
    "name": "string (brief workflow name)",
    "totalSteps": number,
    "estimatedTime": "string (e.g., '2-3 minutes')",
    "complexity": "simple" | "moderate" | "complex",
    "steps": [
      {
        "stepNumber": 1,
        "action": "login" | "fetch" | "search" | "submit" | "verify",
        "method": "GET" | "POST" | "PUT" | "DELETE",
        "endpoint": "string",
        "purpose": "string (why this step is needed)",
        "dependencies": ["array of step numbers this depends on"],
        "extractVariables": ["array of variable names to extract"],
        "usesVariables": ["array of variable names needed from previous steps"],
        "optional": boolean,
        "parallelizable": boolean,
        "expectedResult": "string (what this returns)"
      }
    ],
    "dataFlow": [
      {
        "from": "step number",
        "to": "step number",
        "variable": "variable name",
        "purpose": "why this data is passed"
      }
    ],
    "potentialIssues": [
      {
        "issue": "string (what could go wrong)",
        "mitigation": "string (how to handle it)",
        "severity": "high" | "medium" | "low"
      }
    ]
  },
  "confidence": 0.85,
  "alternatives": [
    {
      "approach": "string (alternative strategy)",
      "reason": "string (when to use this instead)"
    }
  ],
  "insights": ["array of helpful observations"]
}

If the goal is unclear or endpoints insufficient, still provide a best-effort plan with placeholders.`;

    console.log('[AI Plan] Generating workflow plan...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert API workflow architect. Always respond with valid JSON only, no markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
    });

    const content = completion.choices[0].message.content;
    console.log('[AI Plan] Response received:', content);

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const plan = JSON.parse(content);

    return NextResponse.json({
      ok: true,
      plan,
      tokensUsed: completion.usage?.total_tokens || 0,
    });

  } catch (err) {
    console.error('[AI Plan] Error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
