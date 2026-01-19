# Income Pre-Qualification Engine v2.0 - Enhancements

## Overview

Enhanced income pre-qualification engine with 7 major improvements for better decision accuracy and cost control.

## ✅ Implemented Enhancements

### 1. Two-Pass Estimator (BIGGEST WIN)

**Pass 1: Conservative Floor** (underestimate bias)
- Answers: "Is this very likely low income?"
- Purpose: Avoid false negatives (killing good leads)
- Uses lower bounds, wider ranges, conservative adjustments

**Pass 2: Upside Ceiling** (overestimate bias)
- Answers: "Is there plausible upside worth enriching?"
- Purpose: Avoid wasting spend on hopeless leads
- Uses upper bounds, optimistic adjustments

**Decision Logic:**
```
If conservative_max < floor_threshold (50k) → STOP
If upside_min > enrich_threshold (75k) → CONTINUE
Else → UNKNOWN → CONTINUE LIMITED
```

This dual-pass approach improves decision accuracy far more than tightening ranges.

### 2. Career Ladder Normalization

**Ladder Structure:**
```
IC → Senior IC → Lead → Manager → Director → Exec
```

**Features:**
- Maps titles to career ladder rungs (not direct salary mapping)
- Detects aspirational vs organizational titles
  - "Founder" at 1-person LLC ≠ real executive comp
  - "Director" at Fortune 500 ≠ "Director" at local firm
- Downgrades seniority when company signals don't support it
- Flags inflated titles automatically

**Implementation:**
- Combines title seniority + company type
- Downgrades seniority when company signals don't support it
- Reduces systematic overestimation (where most estimators fail)

### 3. Income Inertia (Anti-Jump Protection)

**Rule:**
- Large positive deltas require multiple strong signals
- Otherwise, cap upward movement to 15-20%

**Example:**
```typescript
if (titleSuggestsHighIncome && geo + company disagree) {
  clampMaxIncrease(18%) // Prevents unrealistic jumps
}
```

**Benefits:**
- Makes estimates human-realistic, not spreadsheet-perfect
- Prevents wild swings based on single signals
- Requires consensus from multiple data points

### 4. ZIP Data Enhancement (No New APIs)

**ZIP-to-State Comparison:**
- Compares ZIP median to state median (cached/static data)
- Flags ZIPs that are:
  - Significantly above state average (>1.2x)
  - Significantly below state average (<0.8x)

**Output:**
```typescript
geoBias = {
  relativeWealth: 'high' | 'average' | 'low'
  stateMedian: number
  zipMedian: number
}
```

**Benefits:**
- More useful than raw median alone
- Provides relative positioning context
- No API calls required (uses static state median data)

### 5. Carrier Data Upgrade (Line Type × Tenure Logic)

**Old Logic:** "carrier = wealth"

**New Logic:**
- Prepaid + long tenure → stability, not poverty
- VoIP + business indicators → higher income likelihood
- Recently ported prepaid → instability risk

**Output:**
```typescript
{
  stabilitySignal: 'high' | 'medium' | 'low' | 'unknown'
  varianceAdjustmentPct: number
  confidenceAdjustment: number
}
```

**Benefits:**
- Improves confidence scoring, not just income guessing
- More nuanced understanding of carrier signals
- Better handles edge cases (prepaid ≠ always low income)

### 6. Confidence Decay (Aggressive Penalties)

**Old Approach:** Additive confidence scoring

**New Approach:** Aggressive penalties for:
- Missing major signals (title, company, location)
- Signals that disagree (age vs seniority, geo vs title)
- Aspirational titles
- Multiple conflicts

**Penalties:**
- Missing title seniority: -0.15 (was +0.10)
- Missing company: -0.12 (was +0.05)
- Signal disagreement: -0.10
- Each conflict: -0.12 (was -0.08)
- Aspirational title: -0.10

**Benefits:**
- Fewer wrong decisions
- Higher ROI
- Better long-term learning
- Explicit uncertainty (not hidden)

### 7. Historical Cohort Memory (Optional)

**Status:** ⏸️ Pending (can be added later if needed)

**Design:**
```typescript
{
  title: string
  industry: string
  geoBucket: string
  enrichmentOutcome: 'success' | 'failure' | 'low_value'
}
```

**Purpose:**
- Adjust future estimates based on observed success
- Not assumed income, but actual outcomes
- How underwriting systems quietly get smarter

## Technical Implementation

### File Structure
- `utils/enrichment/incomePreQualifier.ts` - Main module (v2.0)
- `data/state-median-income.json` - State median income data (static, no APIs)

### Integration Points
- Runs as STEP 4.5 in `utils/enrichData.ts`
- After Telnyx, before gatekeep
- Non-fatal errors (pipeline continues if pre-qual fails)

### Output Structure
```typescript
{
  conservative: { min, max, p50 },
  upside: { min, max, p50 },
  estimate: {
    range: { min, max },
    p50: number,
    confidence: number,
    primaryDrivers: string[],
    riskFlags: string[]
  },
  decision: {
    tier: 'low' | 'mid' | 'high' | 'unknown',
    shouldContinueEnrichment: boolean,
    reason: string
  }
}
```

## Decision Accuracy Improvements

### Before (v1.0)
- Single-pass estimation
- Direct title → salary mapping
- No income inertia
- Simple carrier logic
- Additive confidence

### After (v2.0)
- Two-pass estimation (conservative + upside)
- Career ladder normalization
- Income inertia protection
- ZIP-to-state relative positioning
- Line type × tenure carrier logic
- Aggressive confidence decay

### Expected Results
- **Fewer false negatives**: Conservative floor prevents killing good leads
- **Fewer false positives**: Upside ceiling prevents wasting spend
- **Better accuracy**: Career ladder + income inertia = more realistic estimates
- **Higher ROI**: Confidence decay ensures only high-confidence decisions

## Cost Savings

- **LOW tier leads**: Skip age enrichment, additional skip-tracing, property/asset APIs
- **Estimated savings**: 1-2 API calls per low-income lead
- **Decision accuracy**: Two-pass approach reduces both false positives and false negatives

## Success Criteria

✅ Two-pass estimator implemented  
✅ Career ladder normalization with aspirational detection  
✅ Income inertia prevents unrealistic jumps  
✅ ZIP-to-state comparison (no new APIs)  
✅ Carrier logic upgraded (line type × tenure)  
✅ Confidence decay with aggressive penalties  
⏸️ Historical cohort memory (optional, pending)  

## Next Steps

1. Monitor decision accuracy in production
2. Collect outcome data for historical cohort memory (if desired)
3. Fine-tune thresholds based on actual results
4. Expand career ladder mappings as needed
