# Comprehensive API Verification Report

**Date**: 2025-12-15T00:33:57.532Z
**Total API Calls Used**: 27
**Status**: ⚠️ 3 Tests Failed

---

## Summary

- ✅ **Passed**: 24
- ❌ **Failed**: 3
- ⚠️ **Warnings**: 2 (low accuracy)
- 💰 **API Calls Used**: 27

---

## Recommendations

- ✅ Use URN format for companies (Format B) - returns more results
- ✅ Use letter codes for COMPANY_HEADCOUNT (Format B)
- ❌ LOCATION filter accuracy is low - API may not be applying filter correctly

---

## Detailed Results


### 1. Location Suggestions

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 2. Company Suggestions

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 3. Industry Suggestions

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 4. Job Title Suggestions

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 5. Technology Options

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 6. School Suggestions

- **Status**: ❌ Failed
- **Results Count**: 0
- **Accuracy**: N/A


- **Response Path**: N/A


### 7. Years of Experience

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 8. Company Headcount

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 9. Annual Revenue

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 10. Followers Count

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 11. Department Headcount

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 12. Recent Activities

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 13. Job Opportunities

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 14. Fortune

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 15. Languages

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 16. Seniority Level

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 17. Company Type

- **Status**: ✅ Passed
- **Results Count**: 1
- **Accuracy**: N/A


- **Response Path**: N/A


### 18. Search Suggestions

- **Status**: ❌ Failed
- **Results Count**: 0
- **Accuracy**: N/A


- **Response Path**: N/A


### 19. LOCATION Filter - Maryland

- **Status**: ✅ Passed
- **Results Count**: 25
- **Accuracy**: 0.0%
- **Filter Accuracy**: {
  "location": 0
}

- **Response Path**: response.data


### 20. CURRENT_COMPANY - Format A (normalized)

- **Status**: ✅ Passed
- **Results Count**: 0
- **Accuracy**: N/A


- **Response Path**: response.data


### 21. CURRENT_COMPANY - Format B (URN)

- **Status**: ✅ Passed
- **Results Count**: 25
- **Accuracy**: 0.0%
- **Filter Accuracy**: {
  "company": 0
}

- **Response Path**: response.data


### 22. COMPANY_HEADCOUNT - Format A (numeric)

- **Status**: ✅ Passed
- **Results Count**: 0
- **Accuracy**: N/A


- **Response Path**: response.data


### 23. COMPANY_HEADCOUNT - Format B (letter)

- **Status**: ✅ Passed
- **Results Count**: 25
- **Accuracy**: N/A


- **Response Path**: response.data


### 24. Combined: LOCATION + CURRENT_COMPANY

- **Status**: ✅ Passed
- **Results Count**: 0
- **Accuracy**: N/A


- **Response Path**: response.data


### 25. json_to_url Generation

- **Status**: ❌ Failed
- **Results Count**: N/A
- **Accuracy**: N/A

- **Error**: No URL in response



### 26. CHANGED_JOBS_90_DAYS

- **Status**: ✅ Passed
- **Results Count**: 25
- **Accuracy**: N/A


- **Response Path**: response.data


### 27. INDUSTRY Filter

- **Status**: ✅ Passed
- **Results Count**: 0
- **Accuracy**: N/A


- **Response Path**: unknown


---

**Generated**: 2025-12-15T00:33:57.533Z
