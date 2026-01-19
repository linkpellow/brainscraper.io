# Free Enhancement Proposals for Gender, Income, and Name Normalization

## 1. Gender Detection Enhancements

### Current State
- 5000+ name database
- Cultural pattern matching
- Fuzzy matching
- Confidence scoring

### Proposed Free Enhancements

#### A. Title-Based Gender Inference
**Enhancement**: Use professional titles and prefixes to infer gender
- "Mrs." / "Ms." → Female (95% confidence)
- "Mr." → Male (95% confidence)
- "Dr." + first name pattern → Can boost confidence
- "Miss" → Female (98% confidence)

**Implementation**: Check `prefix` field from NameNormalizationService

#### B. Last Name Pattern Matching (Cultural)
**Enhancement**: Some cultures have gender-specific last name patterns
- Slavic: "-ova" / "-eva" endings → Female (85% confidence)
- Spanish: Some compound names indicate gender
- Use as secondary signal when first name is ambiguous

#### C. Compound Name Handling
**Enhancement**: Handle hyphenated first names better
- "Mary-Jane" → Check both parts
- "Jean-Pierre" → Male (French compound)
- "Anne-Marie" → Female (French compound)

#### D. Nickname Expansion
**Enhancement**: Add more nickname variations
- "Bob" → Robert (male)
- "Bill" → William (male)
- "Peggy" → Margaret (female)
- "Dick" → Richard (male)
- Expand database with 200+ common nicknames

#### E. Contextual Signals
**Enhancement**: Use job title context when available
- "Nurse" → 90% female (statistical)
- "Engineer" → 75% male (statistical)
- "Teacher" → 60% female (statistical)
- Use as tie-breaker for ambiguous names

#### F. Phonetic Matching
**Enhancement**: Handle spelling variations
- "Catherine" vs "Katherine" → Same gender
- "Steven" vs "Stephen" → Same gender
- Use Soundex or Metaphone algorithm (free)

---

## 2. Income Estimation Enhancements

### Current State
- Title decomposition
- Company bias inference
- Geographic constraints
- Age adjustments
- Carrier signals
- Cohort memory

### Proposed Free Enhancements

#### A. Education Level Inference from Name Suffixes
**Enhancement**: Extract education level from normalized name suffixes
- PhD → +15-25% income boost (academic/research roles)
- MBA → +10-20% income boost (business roles)
- MD → Use medical salary ranges
- JD → Use legal salary ranges
- CPA → Use accounting salary ranges

**Implementation**: Use `suffixes` array from NameNormalizationService

#### B. Industry-Specific Adjustments
**Enhancement**: Infer industry from company name and apply adjustments
- Tech companies (Google, Microsoft, Apple) → +20-30% multiplier
- Finance (Goldman, JPMorgan) → +25-35% multiplier
- Healthcare (Mayo, Cleveland Clinic) → Use healthcare ranges
- Retail (Walmart, Target) → -10-15% multiplier
- Non-profit → -20-30% multiplier

**Pattern Matching**:
```typescript
const TECH_KEYWORDS = ['tech', 'software', 'systems', 'solutions', 'digital', 'cloud', 'data'];
const FINANCE_KEYWORDS = ['bank', 'capital', 'financial', 'investment', 'wealth', 'asset'];
const HEALTHCARE_KEYWORDS = ['health', 'medical', 'hospital', 'clinic', 'care', 'wellness'];
```

#### C. Company Size Inference
**Enhancement**: Infer company size from name patterns
- "Inc." / "Corp." / "LLC" → Medium to large
- "LLC" alone → Small to medium
- "Group" / "Holdings" → Large
- No suffix → Could be startup or small

**Adjustments**:
- Large companies → +10-15% (better benefits, stock options)
- Startups → Wider variance, potential equity upside
- Small companies → -5-10%

#### D. Title Normalization Improvements
**Enhancement**: Better handling of ambiguous titles
- "Manager" → Check function (Engineering Manager vs Sales Manager)
- "Lead" → Infer seniority from context
- "Principal" → Tech = high, other = medium-high
- "VP" variations → VP of Sales vs VP of Engineering (different ranges)

**Additional Patterns**:
- "Head of" → Director-level
- "Chief" → C-level
- "Founder" → Wide range, use company size
- "Co-founder" → Similar to founder

#### E. Geographic Cost-of-Living Adjustments
**Enhancement**: Use state/city cost-of-living data (free sources)
- San Francisco, NYC → +30-40% multiplier
- Seattle, Boston → +20-25% multiplier
- Austin, Denver → +10-15% multiplier
- Rural areas → -10-15% multiplier

**Free Data Sources**:
- Census Bureau cost-of-living indices
- BLS regional price parities
- State-level economic data

#### F. LinkedIn Company Follower Count (if available)
**Enhancement**: Use company size signals from LinkedIn data
- High follower count → Large company → Higher income
- Low follower count → Small company → Lower income
- Use as confidence booster

#### G. Title Seniority Refinement
**Enhancement**: Better detection of seniority levels
- "Senior" + function → Mid-senior level
- "Staff" / "Principal" → Senior level (tech)
- "Distinguished" / "Fellow" → Very senior (tech)
- "Associate" → Junior level
- "Executive" → C-level

#### H. Years of Experience Estimation
**Enhancement**: Estimate experience from title progression
- "Junior" / "Associate" → 0-3 years
- No prefix → 3-7 years
- "Senior" → 7-12 years
- "Lead" / "Principal" → 12+ years
- "Director" → 15+ years
- "VP" / "C-level" → 20+ years

**Adjustment**: Apply experience-based multipliers

---

## 3. Name Normalization Enhancements

### Current State
- Emoji/noise removal
- Prefix/title stripping
- Middle initial removal
- Suffix extraction
- Hyphenated name preservation
- Email-based last name recovery

### Proposed Free Enhancements

#### A. Better Compound Name Handling
**Enhancement**: Improve hyphenated name detection
- "Mary Jane Watson-Smith" → First: "Mary Jane", Last: "Watson-Smith"
- "Jean-Pierre Dupont" → First: "Jean-Pierre", Last: "Dupont"
- Handle three-part names better

#### B. International Name Patterns
**Enhancement**: Better handling of international naming conventions
- Spanish: "María José García" → First: "María José", Last: "García"
- Arabic: "Mohammed Ali Hassan" → Handle patronymics
- Chinese: "Wei Zhang" → First: "Wei", Last: "Zhang" (already handled)
- Handle name order differences (some cultures: Last First)

#### C. Title Extraction from Middle of Name
**Enhancement**: Extract titles that appear in middle
- "John Dr. Smith" → Extract "Dr." even if not at start
- "Jane Prof. Doe" → Extract "Prof."

#### D. Better Suffix Detection
**Enhancement**: More comprehensive suffix patterns
- Add: "LLM", "MFA", "MEd", "MSN", "DNP", "DVM", "DPM"
- Handle multiple suffixes: "John Doe, MD, PhD, MBA"
- Better compound suffix handling

#### E. Email Recovery Pattern Expansion
**Enhancement**: More email pattern variations
- Handle numbers in middle: "john123doe@gmail.com"
- Handle multiple separators: "john_doe_smith@gmail.com"
- Handle reversed: "doejohn@gmail.com" (less common)
- Handle initials: "j.doe@gmail.com" → "John Doe"

#### F. Company Email Detection
**Enhancement**: Better handling of corporate emails
- "first.last@company.com" → Standard corporate format
- "firstlast@company.com" → Also common
- "flast@company.com" → Initial + last name
- Don't confuse domain with last name

#### G. Nickname Normalization
**Enhancement**: Expand common nicknames to full names
- "Bob" → "Robert"
- "Bill" → "William"
- "Jim" → "James"
- "Mike" → "Michael"
- Use for better gender detection and matching

#### H. Diacritic Handling
**Enhancement**: Better Unicode normalization
- "José" → "Jose"
- "François" → "Francois"
- "Müller" → "Mueller"
- Already partially implemented, but can be expanded

---

## Implementation Priority

### High Priority (High Impact, Low Effort)
1. ✅ Education level inference from suffixes (already have suffixes)
2. ✅ Title-based gender inference (already have prefix)
3. ✅ Industry keyword matching for income
4. ✅ Company size inference from name patterns
5. ✅ Better title seniority detection

### Medium Priority (Good Impact, Moderate Effort)
6. Nickname expansion for gender detection
7. Geographic cost-of-living adjustments
8. Compound name handling improvements
9. More email recovery patterns
10. International name pattern handling

### Low Priority (Nice to Have)
11. Phonetic matching for gender
12. Last name pattern matching
13. LinkedIn follower count integration
14. Years of experience estimation

---

## Free Data Sources

1. **Census Bureau APIs** (already using)
   - Income data by ZIP
   - Cost-of-living indices
   - Regional price parities

2. **BLS (Bureau of Labor Statistics)**
   - Occupational wage data
   - Industry wage data
   - Regional wage data

3. **Open Data Portals**
   - State economic data
   - City economic data
   - Industry statistics

4. **Public Name Databases**
   - Baby name statistics (gender distribution)
   - Surname databases
   - Cultural name patterns

---

## Expected Accuracy Improvements

### Gender Detection
- Current: ~99% for known names
- With enhancements: ~99.5% (better handling of edge cases)
- Ambiguous names: Better confidence scoring

### Income Estimation
- Current: ~70-80% accuracy (within $20k range)
- With enhancements: ~75-85% accuracy
- Better handling of edge cases (startups, non-profits, etc.)

### Name Normalization
- Current: ~95% accuracy
- With enhancements: ~98% accuracy
- Better international name handling
- Better email recovery success rate
