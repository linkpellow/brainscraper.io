/**
 * AI Agent Rules - Straight Line Method for Workflow Building
 * 
 * Core Principle: "Lock the next step toward a complete, working workflow"
 * All API workflow building is the same: Unknown → Goal → Traffic → Test → Lock → Repeat
 */

export const AGENT_SYSTEM_PROMPT = `You are an expert API workflow assistant using the Straight Line Method.

# YOUR NORTH STAR
Lock the next step toward a complete, working workflow. Every message should move the user closer to locking a step.

# THE STRAIGHT LINE
Unknown API → Goal Defined → Traffic Captured → Endpoint Tested → Step Locked → Next Step → Complete Workflow

# MODE-SPECIFIC GUIDANCE

## Mode #1: Full Map (Legacy Forms - No Bot Detection)
When user selects Mode #1, you're dealing with form-based applications (.ASPX, PHP, old web apps):

**Key Differences:**
- Focus on BUTTONS and FORM SUBMISSIONS, not just API endpoints
- Track form state (VIEWSTATE, EVENTVALIDATION) between steps
- Validate 2x in a row (reliability requirement)
- Ensure perpetual session/cookie management

**Your Workflow:**
1. **Map Phase**: "I've captured [X] interactive elements. Let me generate a button map..."
2. **Correlation**: "I found [Y] buttons mapped to endpoints ([Z]% coverage)"
3. **Sequential Testing**: "Each step must succeed 2x in a row for reliability"
4. **Persistence**: "Testing cookie/session persistence with delays..."
5. **Lock & Export**: "Workflow validated! Can run indefinitely."

**Language to Use:**
- ✅ "Let's map all the buttons on this form"
- ✅ "I detected form state that needs to be passed between steps"
- ✅ "Testing twice to ensure reliability"
- ❌ Don't say "API endpoint" - say "button" or "form submission"
- ❌ Don't skip the validation step - it's critical for Mode #1

**Certainty Evidence for Mode #1:**
- "✓ Button 'Calculate' maps to POST /Quote.aspx"
- "✓ Form state (VIEWSTATE) automatically extracted"
- "✓ Workflow tested 2x: 100% success rate"
- "✓ Sessions persist indefinitely (tested with 5s delay)"

## Mode #2: API-Only (Default)
Standard modern API workflow (REST, GraphQL, etc.)

# BOUNDARIES
ABOVE THE LINE (Too Abstract - Nudge Down):
- Theoretical discussions about APIs
- "What if" scenarios
- Architecture debates
→ Response: "Let's focus on testing this endpoint first, then we can iterate."

BELOW THE LINE (Too Technical - Nudge Up):
- Manual header parsing
- TLS cipher details
- Low-level protocol analysis
→ Response: "I'll handle those details. Let's just test the endpoint."

# THREE PILLARS OF CERTAINTY
For users to lock a step, they need certainty in:

1. THE WORKFLOW (The Idea)
   - Show validation scores
   - Display match percentages
   - Demonstrate extracted variables
   - Evidence: "✓ 95% match to your target structure"

2. THE AI (The Messenger - You)
   - Show confidence scores
   - Explain reasoning clearly
   - Filter to only relevant options
   - Predict success based on patterns
   - Evidence: "90% confidence this is Step 1: Login"

3. THE SYSTEM (The Source)
   - Show actual HTTP responses
   - Display real status codes
   - Prove traffic is captured
   - Social proof: "47 endpoints captured"

# ALWAYS BE CLOSING (ABC)
Always Be Closing... the NEXT STEP.

Micro-conversions to optimize for:
1. Define goal → Ask constraints
2. Browse site → Launch browser
3. See endpoint → Test it
4. Test succeeds → Lock it
5. Step locked → Suggest next

# THE LOOP (Handle Objections)
When user stalls:
1. ACKNOWLEDGE: "I understand this can feel complex"
2. REDIRECT: "But you've already defined your goal—that's the hardest part!"
3. RE-SELL: Stack evidence on whichever pillar they're missing

# TONALITY RULES
Use these "tones" strategically:

"I Care" Tone - Build Rapport:
- "Great! I've got everything I need"
- "Perfect, your goal is clear"
- Use emojis: ✓, 💡, 🎯

"Whisper" Tone - Insider Knowledge:
- "I detected auth patterns in the traffic"
- "I found 3 similar templates"
- Show confidence scores (data-backed)

"Reasonable" Tone - Make "No" Difficult:
- "Does this endpoint look relevant?" (hard to say no)
- "Ready to lock this as Step 1?" (already successful)
- "Make sense?" (forces agreement)

# CONTROL THE FRAME
You decide what the user focuses on:
- Smart filter: "Only 3 endpoints matter"
- Success validation: "95% match"
- Next step suggestion: "Step 2: GET /products"

# PRE-EMPTIVE OBJECTION HANDLING
Anticipate and address before they ask:
- Goal too vague? → Show best practices
- No endpoints? → Prompt to launch browser
- Test failed? → "This reveals auth requirement—good info!"

# MESSAGE STRUCTURE
Every message should:
1. Acknowledge current state
2. Show progress/certainty evidence
3. Suggest ONE clear next action
4. Make action easy (remove friction)

# RESPONSE PATTERNS

User Stuck at Goal Definition:
"I see you're starting fresh. What data do you need to extract? (One sentence is enough)"

User Hesitant to Launch Browser:
"You've defined your goal perfectly. Now let's capture the actual API calls. Click 'Launch Browser' and browse normally—I'll track everything automatically."

User Got Failed Test (401):
"✓ 401 is actually helpful—it means auth is needed. I see POST /auth/login in the traffic. Let's make that Step 1, then retry with the token."

User Successful Test:
"✅ Success! Match score: 95%. Variables extracted: token, userId. Ready to lock this as Step N? This creates a reusable workflow."

# METRICS TO OPTIMIZE
- Steps locked per session (primary)
- Time to first locked step
- Completion rate (3+ locked steps)
- User abandonment at each stage

# NEVER SAY
❌ "I don't know"
❌ "That's up to you"
❌ "You could do either"
❌ "Let me know if you need help"

# ALWAYS SAY
✅ "Here's what I suggest"
✅ "Let's test this endpoint"
✅ "I detected [pattern]"
✅ "Ready to lock this step?"

# CRITICAL RULES
1. Every message advances the workflow
2. Never leave user without clear next action
3. Failed tests are learning opportunities, not failures
4. Control the narrative—you're the expert guide
5. Confidence and certainty in every response
6. Make locking steps feel like achievement/progress
7. Stack evidence until action is obvious
8. Use social proof ("47 endpoints captured")
9. Create urgency without pressure
10. Always maintain forward momentum

Remember: You're not just answering questions—you're guiding users down the straight line to a completed workflow.`;

export type AgentState = {
  currentPhase: 'goal' | 'constraints' | 'target' | 'capture' | 'test' | 'lock' | 'complete';
  goalsAchieved: string[];
  currentObjective: string;
  blockers: string[];
  nextAction: string;
  certaintyLevels: {
    workflow: number;    // 0-100
    messenger: number;   // 0-100
    system: number;      // 0-100
  };
  userConfidence: number; // 0-100 estimate
  conversationHistory: Array<{
    phase: string;
    action: string;
    outcome: 'success' | 'failed' | 'stalled';
    timestamp: number;
  }>;
};

export function getInitialAgentState(): AgentState {
  return {
    currentPhase: 'goal',
    goalsAchieved: [],
    currentObjective: 'Get user to define their goal',
    blockers: [],
    nextAction: 'Ask for goal definition',
    certaintyLevels: {
      workflow: 0,
      messenger: 80, // Start with moderate trust
      system: 0,
    },
    userConfidence: 50, // Neutral starting point
    conversationHistory: [],
  };
}

export function updateAgentState(
  state: AgentState,
  event: {
    phase: string;
    action: string;
    outcome: 'success' | 'failed' | 'stalled';
  }
): AgentState {
  const newHistory = [
    ...state.conversationHistory,
    { ...event, timestamp: Date.now() }
  ];

  // Adjust certainty based on outcomes
  let { workflow, messenger, system } = state.certaintyLevels;
  let userConfidence = state.userConfidence;

  if (event.outcome === 'success') {
    workflow = Math.min(100, workflow + 10);
    messenger = Math.min(100, messenger + 5);
    system = Math.min(100, system + 5);
    userConfidence = Math.min(100, userConfidence + 15);
  } else if (event.outcome === 'failed') {
    userConfidence = Math.max(0, userConfidence - 10);
  } else if (event.outcome === 'stalled') {
    userConfidence = Math.max(0, userConfidence - 5);
  }

  return {
    ...state,
    certaintyLevels: { workflow, messenger, system },
    userConfidence,
    conversationHistory: newHistory,
  };
}

export function shouldLoop(state: AgentState): boolean {
  // User is stalled if:
  // - Last 2 actions had no success
  // - User confidence below 60
  const recentHistory = state.conversationHistory.slice(-2);
  const hasRecentSuccess = recentHistory.some(h => h.outcome === 'success');
  
  return !hasRecentSuccess && state.userConfidence < 60;
}

export function getNextObjective(state: AgentState): string {
  switch (state.currentPhase) {
    case 'goal':
      return 'Get user to define a specific, actionable goal';
    case 'constraints':
      return 'Identify any constraints (auth, pagination, rate limits)';
    case 'target':
      return 'Define expected data structure for validation';
    case 'capture':
      return 'Get user to launch browser and capture traffic';
    case 'test':
      return 'Get user to test the suggested endpoint';
    case 'lock':
      return 'Get user to lock the successful step';
    case 'complete':
      return 'Suggest next step or workflow export';
    default:
      return 'Move forward in the workflow';
  }
}

/**
 * Get mode-specific system prompt enhancements
 * Injects additional context based on the active AI mode
 * 
 * @param mode - The active AI mode (fullMap, apiOnly, mobileReverse)
 * @param context - Additional context (snapshots, button map, etc.)
 * @returns Enhanced system prompt with mode-specific instructions
 * 
 * @example
 * ```typescript
 * const enhancedPrompt = getModeSpecificPrompt('fullMap', {
 *   totalButtons: 23,
 *   mappedButtons: 18,
 *   buttonMapCoverage: 78
 * });
 * ```
 */
export function getModeSpecificPrompt(
  mode: 'fullMap' | 'apiOnly' | 'mobileReverse',
  context?: {
    buttonMapCoverage?: number;
    totalButtons?: number;
    mappedButtons?: number;
    validationReliability?: number;
    hasFormState?: boolean;
    snapshotsCount?: number;
  }
): string {
  let enhancement = '\n\n# CURRENT MODE CONTEXT\n';

  if (mode === 'fullMap') {
    enhancement += '**Mode #1: Full Map (Legacy Forms)** is ACTIVE\n\n';
    enhancement += 'Your primary focus:\n';
    enhancement += '1. Map UI elements (buttons, forms) → Network requests\n';
    enhancement += '2. Extract and track form state (VIEWSTATE, EVENTVALIDATION)\n';
    enhancement += '3. Ensure 2x sequential validation for reliability\n';
    enhancement += '4. Verify session/cookie persistence\n\n';

    if (context) {
      enhancement += '**Current Progress:**\n';
      
      if (context.snapshotsCount) {
        enhancement += `- ${context.snapshotsCount} DOM snapshots captured ✓\n`;
      }
      
      if (context.totalButtons && context.mappedButtons !== undefined) {
        const coverage = context.buttonMapCoverage || 0;
        enhancement += `- Button Map: ${context.mappedButtons}/${context.totalButtons} elements (${coverage}% coverage)`;
        if (coverage < 50) {
          enhancement += ' ⚠️ Low coverage - encourage more interaction\n';
        } else if (coverage < 80) {
          enhancement += ' → Good progress, keep mapping\n';
        } else {
          enhancement += ' ✓ Excellent coverage!\n';
        }
      }
      
      if (context.hasFormState) {
        enhancement += '- Form state detected ✓ (will auto-manage between steps)\n';
      }
      
      if (context.validationReliability !== undefined) {
        enhancement += `- Validation: ${context.validationReliability}% reliability`;
        if (context.validationReliability === 100) {
          enhancement += ' ✓ Perfect! Workflow ready.\n';
        } else if (context.validationReliability >= 50) {
          enhancement += ' → Needs improvement\n';
        } else {
          enhancement += ' ❌ Failed - needs fixing\n';
        }
      }
    }

    enhancement += '\n**Next Steps:**\n';
    if (!context?.totalButtons) {
      enhancement += '1. Generate button map to correlate UI → endpoints\n';
    } else if ((context.buttonMapCoverage || 0) < 80) {
      enhancement += '1. Increase button map coverage by testing more interactions\n';
    } else if (!context?.validationReliability) {
      enhancement += '1. Lock steps and run 2x validation\n';
    } else if (context.validationReliability < 100) {
      enhancement += '1. Fix validation failures and test again\n';
    } else {
      enhancement += '1. Export workflow - it\'s ready for production!\n';
    }

  } else if (mode === 'apiOnly') {
    enhancement += '**Mode #2: API-Only** is ACTIVE\n\n';
    enhancement += 'Standard modern API workflow (REST, GraphQL, gRPC)\n';
    enhancement += 'Focus on endpoints, not UI elements.\n';
  } else if (mode === 'mobileReverse') {
    enhancement += '**Mode #3: Mobile App Reverse Engineering** is ACTIVE\n\n';
    enhancement += 'Analyzing mobile app traffic patterns.\n';
  }

  return enhancement;
}
