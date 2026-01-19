# Historical Cohort Memory System

## Overview

The Historical Cohort Memory System learns from actual enrichment outcomes to improve income estimates over time. This is how underwriting systems quietly get smarter - not from assumed income, but from observed outcomes.

## How It Works

### 1. Cohort Identification

Each lead is assigned to a cohort based on:
- **Title**: Normalized job title (e.g., "engineer", "manager", "director")
- **Industry**: Inferred from company name (e.g., "tech", "finance", "healthcare")
- **GeoBucket**: State or ZIP code

Example cohort: `engineer|tech|90210`

### 2. Outcome Recording

After enrichment completes, outcomes are recorded:
- **success**: High-value lead (converted, engaged, high-quality)
- **failure**: Low-value or no conversion (wasted enrichment spend)
- **low_value**: Lead enriched but low value (not worth the cost)

### 3. Historical Adjustments

When estimating income for a new lead:
- System checks if cohort has historical data (minimum 5 observations)
- Calculates success rate from past outcomes
- Applies adjustment to income estimates:
  - High success rate (>60%) → positive adjustment (up to +20%)
  - Low success rate (<30%) → negative adjustment (down to -15%)
  - Moderate success rate → small positive adjustment

### 4. Confidence Weighting

More observations = more confidence in adjustment:
- 5-10 observations: 50% weight
- 10-20 observations: 75% weight
- 20+ observations: 100% weight

## Data Storage

**File**: `data/income-cohort-memory.json`

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-01-27T12:00:00Z",
  "cohorts": {
    "engineer|tech|90210": {
      "success": 15,
      "failure": 3,
      "lowValue": 2,
      "total": 20,
      "lastUpdated": "2025-01-27T12:00:00Z"
    }
  }
}
```

## Integration

### Recording Outcomes

```typescript
import { recordEnrichmentOutcome, determineOutcomeFromResult } from '@/utils/enrichment/recordEnrichmentOutcome';

// After enrichment completes
const outcome = determineOutcomeFromResult(
  result.incomePreQual,
  !!result.phone,
  !!result.email,
  !!result.age
);

recordEnrichmentOutcome({
  jobTitle: lead.jobTitle,
  company: lead.company,
  state: lead.state,
  zipCode: lead.zipCode,
  outcome,
});
```

### Automatic Application

The income pre-qualifier automatically applies historical adjustments when:
1. Cohort key can be generated (has title + company + location)
2. Cohort has at least 5 observations
3. Historical data exists

Adjustments are applied to:
- **Conservative floor**: 70% of historical adjustment (conservative)
- **Upside ceiling**: 100% of historical adjustment (optimistic)
- **Confidence score**: ±0.10 adjustment based on historical performance

## Benefits

1. **Self-Improving**: Gets smarter over time without manual tuning
2. **Data-Driven**: Based on actual outcomes, not assumptions
3. **Cohort-Specific**: Learns patterns for specific title/industry/geo combinations
4. **Non-Intrusive**: Optional - system works without historical data
5. **Gradual Learning**: Requires minimum observations to prevent overfitting

## Example

### Initial State (No Historical Data)
- Software Engineer in Tech, ZIP 90210
- Estimated: $110k median
- Confidence: 65%

### After 20 Observations
- Cohort: `engineer|tech|90210`
- Success rate: 75% (15 success, 3 failure, 2 low_value)
- Historical adjustment: +15% median, +0.05 confidence

### Updated Estimate
- Software Engineer in Tech, ZIP 90210
- Estimated: $126k median (adjusted from $110k)
- Confidence: 70% (adjusted from 65%)

## Customization

### Outcome Determination

You can customize how outcomes are determined based on your business logic:

```typescript
function customOutcomeDetermination(
  incomePreQual: IncomePreQualResult,
  enrichmentResult: EnrichmentResult,
  conversionData?: { converted: boolean; revenue?: number }
): 'success' | 'failure' | 'low_value' {
  // Your custom logic here
  if (conversionData?.converted && conversionData.revenue && conversionData.revenue > 1000) {
    return 'success';
  }
  if (incomePreQual.decision.tier === 'low') {
    return 'low_value';
  }
  return 'failure';
}
```

### Industry Inference

The system infers industry from company name. You can extend the industry patterns in `incomeCohortMemory.ts`:

```typescript
const industries: Record<string, RegExp[]> = {
  'your_industry': [/\b(your|patterns|here)\b/i],
  // ...
};
```

## Monitoring

### View Cohort Statistics

```typescript
import { getCohortStats, getAllCohortStats } from '@/utils/enrichment/incomeCohortMemory';

// Get stats for specific cohort
const stats = getCohortStats({
  title: 'engineer',
  industry: 'tech',
  geoBucket: '90210',
});

// Get all cohort stats
const allStats = getAllCohortStats();
```

### Analysis

Track cohort performance over time:
- Which cohorts have high success rates?
- Which cohorts consistently underperform?
- Are adjustments improving decision accuracy?

## Best Practices

1. **Record Outcomes Consistently**: Record outcomes for all enriched leads
2. **Minimum Observations**: Wait for at least 5 observations before trusting adjustments
3. **Regular Review**: Periodically review cohort statistics to identify patterns
4. **Custom Outcomes**: Customize outcome determination based on your business metrics
5. **Data Quality**: Ensure job titles and company names are normalized consistently

## Future Enhancements

- Time-based decay (recent outcomes weighted more heavily)
- Seasonal adjustments
- Cross-cohort learning (similar cohorts inform each other)
- Automated outcome detection (integrate with CRM/conversion tracking)
