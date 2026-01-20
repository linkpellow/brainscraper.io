import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { 
      event,      // 'test_success' | 'test_failure' | 'pattern_detected'
      context,    // { step, request, response, timeline }
      timeline    // array of previous events
    } = await req.json();

    const prompt = `You are observing an API workflow automation to detect patterns, requirements, and constraints.

RECENT TIMELINE:
${timeline.slice(-10).map((e: any, i: number) => 
  `${i + 1}. [${e.timestamp}] ${e.action} → Result: ${e.result}`
).join('\n')}

CURRENT EVENT:
Type: ${event.type}
Details: ${JSON.stringify(event.details, null, 2)}

CONTEXT:
Current Step: ${context.currentStep || 'Unknown'}
${context.request ? `Request: ${context.request.method} ${context.request.url}` : ''}
${context.response ? `Response Status: ${context.response.status}` : ''}
${context.response?.body ? `Response Body: ${JSON.stringify(context.response.body).substring(0, 200)}...` : ''}

TASK: Analyze if this event reveals an important constraint, requirement, or pattern.

Look for:
1. **Credential Requirements**: 401/403 responses, auth headers needed
2. **Conditional Logic**: Requests failing due to missing fields or conditions
3. **Temporal Constraints**: Session timeouts, token expiration
4. **Rate Limiting**: 429 responses, throttling patterns
5. **Field Dependencies**: Form fields that must be filled together
6. **Pagination Patterns**: How to iterate through pages
7. **Data Validation**: Required formats, schemas

IMPORTANT: Return ONLY valid JSON (no markdown) in this format:
{
  "isSignificant": true,
  "type": "credential_required" | "conditional_logic" | "temporal_constraint" | "rate_limit" | "field_dependency" | "pagination_pattern" | "validation_rule" | null,
  "rule": "Clear description of the discovered rule",
  "confidence": 0.92,
  "severity": "high" | "medium" | "low",
  "suggestion": "What the user should do about this",
  "autoFixable": true,
  "autoFix": {
    "action": "add_auth_step" | "add_validation" | "add_delay" | etc,
    "details": {}
  }
}

If the event is NOT significant or doesn't reveal a pattern, return:
{
  "isSignificant": false,
  "type": null,
  "rule": null,
  "confidence": 0.0,
  "severity": "low",
  "suggestion": null,
  "autoFixable": false
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at detecting API patterns and constraints. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5, // Lower temp for more consistent pattern detection
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const observation = JSON.parse(content);

    return NextResponse.json({
      ok: true,
      observation,
      tokensUsed: completion.usage?.total_tokens || 0,
    });

  } catch (err) {
    console.error('[AI Observe] Error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
