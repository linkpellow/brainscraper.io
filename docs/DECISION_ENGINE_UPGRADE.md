# Pre-Enrichment Decision Engine Upgrade

## Overview

The filtering system has been transformed into a sophisticated **Pre-Enrichment Decision Engine** that uses weighted confidence scoring instead of binary pass/fail logic. This upgrade optimizes ROI while controlling costs.

## Key Features Implemented

### 1. Weighted Confidence Scoring ✅
- **Before**: Binary filters (pass/fail)
- **After**: Confidence scores (0-100) combining multiple signals
- **Components**:
  - Age confidence (0-20 points)
  - Title income confidence (0-25 points)
  - ZIP income confidence (0-15 points)
  - Company confidence (0-15 points)
  - Profile completeness (0-10 points)
  - Email quality (0-10 points)
  - Phone quality (0-5 points)

**Decision Thresholds**:
- Score < 30 → Skip all enrichment
- Score 30-60 → Partial enrichment (cheap only)
- Score 60+ → Full enrichment

### 2. Kill Switch Layer ✅
Multi-signal abort mechanism that triggers when 3+ independent weak signals agree:
- Low-income title + Low-income ZIP + Disposable email
- Age > threshold + Low-income title
- Invalid phone + Disposable email

**Why it matters**: Prevents "death-by-a-thousand-calls" scenarios by catching extreme cases early.

### 3. Interval-Based Income Logic ✅
- **Before**: Point estimates (`max = $48k → skip`)
- **After**: Income bands with dynamic thresholds
  - **Low band**: < $40k → always skip
  - **Gray band**: $40k-$60k → require 2 strong positives
  - **High band**: $60k+ → enrich

**Strong Positives**:
- High confidence (>= 65%)
- Corporate email (not free/disposable)
- Valid phone pattern
- Complete LinkedIn profile (>= 80%)

### 4. Machine-Readable Reason Codes ✅
Every decision produces structured reason codes:
```typescript
{
  skipped: true,
  reason: "LOW_INCOME_ZIP + LOW_INCOME_TITLE",
  stage: "PRE_SKIPTRACE",
  codes: ["LOW_INCOME_ZIP", "LOW_INCOME_TITLE", "KILL_SWITCH"]
}
```

**Benefits**:
- Enables A/B threshold testing
- Retroactive analysis
- Explainable and defensible decisions
- Learning system foundation

### 5. Early Normalization ✅
All input data is normalized once, early:
- Title strings (lowercase, trimmed)
- Company names (lowercase, trimmed)
- Email domains (lowercase, free/disposable detection)
- Phone numbers (cleaned, pattern validation)
- Location data (normalized city/state/ZIP)

**Prevents**: Duplicate logic and inconsistent behavior across filters.

### 6. Soft Downgrades ✅
Instead of hard skips, some signals reduce confidence:
- Free email → -15 confidence
- Incomplete LinkedIn → -10 confidence
- Small company name → -5 confidence

**Result**: Keeps optional upside without wasting money on clearly low-quality leads.

### 7. Feedback Loop System ✅
Learning system that:
- Records all decisions with reason codes
- Samples skipped leads for review
- Analyzes false negative rate
- Suggests threshold adjustments
- Applies adjustments automatically

**Files**:
- `data/enrichment-feedback.json` - Decision records
- `data/enrichment-thresholds.json` - Dynamic thresholds

### 8. Dynamic Thresholds ✅
All thresholds can be adjusted via feedback loop:
- `CONFIDENCE_SCORE_MIN` (default: 30)
- `INCOME_MAX_THRESHOLD` (default: 40000)
- `INCOME_HIGH_BAND` (default: 60000)
- `AGE_MAX` (default: 59)

## Architecture

### File Structure
```
utils/enrichment/
├── decisionEngine.ts      # Core decision logic
├── feedbackLoop.ts         # Learning system
└── incomePreQualifier.ts  # Enhanced with interval-based logic
```

### Integration Points
1. **Early Decision** (`pre_linkedin` stage): Before any API calls
2. **Final Decision** (`post_telnyx` stage): After phone/carrier validation
3. **Income Pre-Qual**: Uses interval-based bands
4. **Age Filtering**: Uses dynamic `AGE_MAX` threshold

## Decision Flow

```
1. Normalize all input signals
   ↓
2. Check kill switch (3+ weak signals)
   ↓
3. Calculate confidence score (weighted components)
   ↓
4. Evaluate income band (low/gray/high)
   ↓
5. Determine action:
   - Skip (confidence < 30 OR low income OR age > threshold)
   - Partial (30-60 confidence OR gray band with 2+ positives)
   - Full (60+ confidence AND high income band)
   ↓
6. Apply soft downgrades (reduce confidence)
   ↓
7. Record decision for feedback loop
```

## Benefits

### Cost Optimization
- **Early filtering**: Kill switch prevents unnecessary API calls
- **Partial enrichment**: Gray band leads get limited enrichment
- **Dynamic thresholds**: Adjust based on conversion data

### ROI Optimization
- **Confidence scoring**: Captures edge cases that convert well
- **Soft downgrades**: Keeps optional upside
- **Reason codes**: Enables learning and optimization

### Operational Excellence
- **Explainable decisions**: Every skip has a reason code
- **Feedback loop**: System learns from outcomes
- **A/B testing**: Threshold adjustments can be tested

## Usage

### Decision Engine
```typescript
import { makeEnrichmentDecision, normalizeLeadSignals } from './enrichment/decisionEngine';

const signals = normalizeLeadSignals({
  firstName: 'John',
  lastName: 'Doe',
  jobTitle: 'Senior Engineer',
  company: 'Tech Corp',
  zipCode: '94102',
  email: 'john@techcorp.com',
  // ... other signals
});

const decision = makeEnrichmentDecision(signals, 'pre_skip_trace');
// decision.action: 'skip' | 'partial' | 'full'
// decision.confidence: 0-100
// decision.reasons: Array of DecisionReason
```

### Feedback Loop
```typescript
import { recordOutcome, analyzeFeedback, applyThresholdAdjustments } from './enrichment/feedbackLoop';

// Record conversion outcome
recordOutcome(leadId, {
  converted: true,
  value: 5000,
  notes: 'High-value customer'
});

// Analyze and get suggestions
const analysis = analyzeFeedback();
// analysis.falseNegativeRate: 0.15 (15%)
// analysis.suggestedAdjustments: Array of ThresholdAdjustment

// Apply adjustments
applyThresholdAdjustments(analysis.suggestedAdjustments);
```

## Migration Notes

### Backward Compatibility
- All existing filters still work
- Decision engine enhances, doesn't replace traditional gatekeep
- Thresholds default to original values (59 age, $40k income)

### Performance Impact
- Minimal: Early normalization is fast
- Kill switch prevents expensive API calls
- Feedback loop is async and non-blocking

### Data Changes
- New fields in `EnrichmentResult`:
  - `decisionReason`: Machine-readable reason code
  - `decisionCodes`: Array of decision codes
  - `decisionConfidence`: Overall confidence (0-100)
  - `decisionAction`: 'skip' | 'partial' | 'full'
  - `enrichmentLevel`: 'none' | 'free_only' | 'partial' | 'full'

## Next Steps

1. **Monitor Performance**: Track false negative rate
2. **Review Skipped Leads**: Sample and manually review
3. **Adjust Thresholds**: Use feedback loop suggestions
4. **A/B Test**: Compare old vs new system
5. **Iterate**: Refine confidence weights based on outcomes

## Success Metrics

- **False Negative Rate**: < 10% (skipped leads that convert)
- **Cost Savings**: 30-60% reduction in wasted API calls
- **ROI Improvement**: 15-25% increase in conversion rate
- **Decision Quality**: 95%+ confidence on skip decisions
