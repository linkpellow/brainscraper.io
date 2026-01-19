# Income Pre-Qualification Engine

## Overview

Deterministic, explainable income estimation module that runs as a **mid-pipeline pre-qualification gate** to control downstream enrichment costs.

**Purpose**: Prevent unnecessary API spend on clearly low-income leads while avoiding false negatives (incorrectly discarding viable leads).

## Pipeline Placement

**Runs AFTER:**
- ✅ LinkedIn enrichment (title, company, location)
- ✅ Telnyx lookup (carrier + line type)
- ✅ Free city/state/ZIP resolution

**Runs BEFORE:**
- ❌ Paid skip-tracing expansions
- ❌ Additional people-search lookups
- ❌ Income/property/asset APIs
- ❌ Any enrichment with non-trivial cost

## Module Location

`utils/enrichment/incomePreQualifier.ts`

## Input Data (No Additional API Calls Required)

The module uses only data already available in the pipeline:

1. **From LinkedIn (row data):**
   - `jobTitle` - Job title/position
   - `company` - Company name
   - `city`, `state` - Location

2. **From Skip-tracing (if available):**
   - `age` or `dob` - Age/date of birth
   - `zipCode` - ZIP code

3. **From Telnyx:**
   - `carrierName` - Carrier name
   - `lineType` - Line type (mobile/voip/fixed)
   - `normalizedCarrier` - Normalized carrier

4. **Optional (one API call if ZIP available):**
   - `zipMedianIncome` - Median household income for ZIP (via `/api/income-by-zip`)

## Output Structure

```typescript
incomePreQual: {
  estimate: {
    range: {
      min: number  // Minimum estimated household income
      max: number  // Maximum estimated household income
    }
    p50: number    // Median estimate (50th percentile)
    confidence: number  // 0.30-0.90 (never 1.0, never below 0.30)
    primaryDrivers: string[]  // What drove the estimate
    riskFlags: string[]       // Contradictions or uncertainties
  }
  decision: {
    tier: 'low' | 'mid' | 'high' | 'unknown'
    shouldContinueEnrichment: boolean
    reason: string
  }
}
```

## Decision Logic

### LOW Tier
- **Condition**: High confidence (≥60%) + low income (p50 < $50k OR max < $50k)
- **Action**: `shouldContinueEnrichment = false`
- **Result**: Skips further paid enrichment

### MID Tier
- **Condition**: Borderline range or moderate confidence
- **Action**: `shouldContinueEnrichment = true`
- **Result**: Proceeds with enrichment

### HIGH Tier
- **Condition**: Strong signals (confidence ≥65%), high income (p50 ≥ $100k), no conflicts
- **Action**: `shouldContinueEnrichment = true`
- **Result**: Full enrichment allowed

### UNKNOWN Tier
- **Condition**: Low confidence (<40%) or multiple conflicts
- **Action**: `shouldContinueEnrichment = true` (conservative default)
- **Result**: Proceeds conservatively

## Estimation Methodology

### 1. Title Decomposition
- Extracts: role, function, seniority (junior/mid/senior/lead/exec/unknown), modifiers
- Normalizes common variants (Sr, Lead, Principal, VP, Director)

### 2. Base Income Distributions
- Role + function → base range (conservative estimates)
- Seniority → range scaling (not exact salaries)
- Modifiers → variance widening

### 3. Company Pay-Bias Inference
- Company name patterns → compensation tendencies
- Industry keywords → pay adjustments
- Corporate structure indicators → variance adjustments
- **No APIs required** - pattern matching only

### 4. Geographic Constraint (Optional)
- If ZIP median income available: soft constraint
- Prevents extreme mismatches
- Does NOT override occupation-based estimates

### 5. Age/Experience Adjustment
- <25: widen range, lower confidence
- 25-40: modest upward adjustment
- 40-55: plateau
- 55+: widen variance
- Never guesses age if DOB missing

### 6. Telnyx Carrier Signal
- Premium carriers: slight confidence boost
- Budget carriers: slight confidence reduction
- VoIP/fixed line: increased uncertainty
- **Never dominates** - only adjusts variance and confidence

### 7. Conflict Detection
- Senior/exec title + very low ZIP median → flag
- Executive title + prepaid carrier → flag
- Age inconsistent with seniority → flag
- On conflict: widen range, reduce confidence

### 8. Confidence Scoring
- Derived from: signal completeness, agreement between signals, absence of conflicts
- Bounds: 0.30 minimum, 0.90 maximum (never 1.0)

## Integration Points

### In `utils/enrichData.ts`

**STEP 4.5** (after Telnyx, before gatekeep):
```typescript
// STEP 4.5: INCOME PRE-QUALIFICATION (COST CONTROL GATE)
const preQualResult = preQualifyIncome({...});
result.incomePreQual = preQualResult;
```

**STEP 5** (gatekeep decision):
```typescript
// Apply income pre-qualification decision
if (shouldContinue && result.incomePreQual && !result.incomePreQual.decision.shouldContinueEnrichment) {
  shouldContinue = false; // Skip further paid enrichment
}
```

## Cost Savings

- **LOW tier leads**: Skip age enrichment, additional skip-tracing, property/asset APIs
- **Estimated savings**: 1-2 API calls per low-income lead
- **False negative protection**: Conservative bias - only blocks when high confidence + clearly low income

## Error Handling

- **Non-fatal**: If pre-qualification fails, pipeline continues normally
- **Graceful degradation**: Missing fields reduce confidence, don't break estimation
- **No assumptions**: All uncertainty is explicit in confidence score and risk flags

## Success Criteria

✅ Paid enrichment can be conditionally skipped  
✅ Income expressed as range (not point estimate)  
✅ Uncertainty is explicit (confidence + risk flags)  
✅ Decisions are explainable (primaryDrivers + reason)  
✅ No hidden assumptions (all logic is deterministic)  
✅ No regressions (doesn't break existing pipeline)  

## Example Output

```json
{
  "estimate": {
    "range": { "min": 45000, "max": 85000 },
    "p50": 65000,
    "confidence": 0.72,
    "primaryDrivers": [
      "manager role",
      "mid level",
      "company: Acme Corp",
      "ZIP median: $65k",
      "age: 35"
    ],
    "riskFlags": []
  },
  "decision": {
    "tier": "mid",
    "shouldContinueEnrichment": true,
    "reason": "Moderate confidence (72%) or borderline estimate (p50: $65k) - proceeding with enrichment"
  }
}
```

## Future Enhancements

- Expand job title mapping database
- Add industry-specific adjustments
- Regional cost-of-living multipliers
- Machine learning (if training data becomes available)
