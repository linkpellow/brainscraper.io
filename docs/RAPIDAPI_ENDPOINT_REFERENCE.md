# RapidAPI LinkedIn Sales Navigator - Complete Endpoint Reference

**Date**: 2025-01-14  
**Source**: Direct from RapidAPI Playground  
**Purpose**: Complete reference of all endpoint code examples

---

## Main Search Endpoints

### 1. premium_search_person

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {
    account_number: 1,
    page: 1,
    filters: [
      {
        type: 'POSTAL_CODE',
        values: [
          {
            id: '101041448',
            text: '781104, Guwahati, Assam, India',
            selectionType: 'INCLUDED'
          }
        ],
        selectedSubFilter: 50
      }
    ]
  }
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 2. premium_search_person_via_url

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person_via_url';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {
    page: 1,
    url: 'https://www.linkedin.com/sales/search/people?query=(spellCorrectionEnabled%3Atrue%2CrecentSearchParam%3A(id%3A3987336874%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3ACURRENT_COMPANY%2Cvalues%3AList((id%3Aurn%253Ali%253Aorganization%253A825160%2Ctext%3AHyundai%2520Motor%2520Company%2520%2528%25ED%2598%2584%25EB%258C%2580%25EC%259E%2590%25EB%258F%2599%25EC%25B0%25A8%2529%2CselectionType%3AINCLUDED%2Cparent%3A(id%3A0)))))%2Ckeywords%3Agoo)&sessionId=V%2BfhmkmqTlSofc8%2F1FmgJw%3D%3D',
    account_number: 1
  }
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 3. premium_search_company_via_url

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_company_via_url';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {
    page: 1,
    url: 'https://www.linkedin.com/sales/search/company?query=(spellCorrectionEnabled%3Atrue%2Cfilters%3AList((type%3ACOMPANY_HEADCOUNT%2Cvalues%3AList((id%3AB%2Ctext%3A1-10%2CselectionType%3AINCLUDED))))%2Ckeywords%3Agoo)&sessionId=V%2BfhmkmqTlSofc8%2F1FmgJw%3D%3D&viewAllFilters=true',
    account_number: 1
  }
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 4. json_to_url

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {
    filters: [
      {
        type: 'CURRENT_COMPANY',
        values: [
          {
            id: 'urn:li:organization:1586',
            text: 'Amazon',
            selectionType: 'INCLUDED'
          },
          {
            id: 'urn:li:organization:1441',
            text: 'Google',
            selectionType: 'INCLUDED'
          }
        ]
      },
      {
        type: 'COMPANY_HEADCOUNT',
        values: [
          {
            id: 'A',
            text: 'Self-employed',
            selectionType: 'EXCLUDED'
          }
        ]
      }
    ],
    keywords: 'Ali'
  }
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

## Filter Helper Endpoints

### 5. filter_geography_location_region_suggestions

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_geography_location_region_suggestions';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {query: 'a'}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 6. filter_company_suggestions

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_company_suggestions';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {query: 'goo'}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 7. filter_industry_suggestions

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_industry_suggestions';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {query: 'a'}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 8. filter_school_suggestions

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_school_suggestions';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 9. filter_job_title_suggestions

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_job_title_suggestions';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {query: 'a'}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 10. filter_years_in

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_years_in';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 11. filter_technology

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_technology';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {query: 'a'}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 12. filter_annual_revunue

**Note**: Endpoint name has typo - "revunue" instead of "revenue"

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_annual_revunue';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 13. filter_followers_count

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_followers_count';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 14. filter_department_headcount

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_department_headcount';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 15. filter_recent_activities

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_recent_activities';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 16. filter_job_oppertunities

**Note**: Endpoint name has typo - "oppertunities" instead of "opportunities"

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_job_oppertunities';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 17. filter_fortune

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_fortune';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 18. filter_company_headcount

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_company_headcount';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 19. filter_languages

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_languages';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 20. search_suggestions

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/search_suggestions';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 21. filter_seniority_level

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_seniority_level';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

### 22. filter_company_type

```javascript
const fetch = require('node-fetch');

const url = 'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/filter_company_type';

const options = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962',
    'x-rapidapi-host': 'realtime-linkedin-sales-navigator-data.p.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: {}
};

try {
	const response = await fetch(url, options);
	const result = await response.text();
	console.log(result);
} catch (error) {
	console.error(error);
}
```

---

## Summary

**Total Endpoints**: 22
- **Main Search Endpoints**: 4
- **Filter Helper Endpoints**: 18

**Implementation Status**:
- ✅ All endpoints have utility functions in `utils/linkedinFilterHelpers.ts`
- ✅ Location suggestions integrated into `utils/linkedinLocationSuggestions.ts`
- ✅ Location discovery enhanced in `utils/linkedinLocationDiscovery.ts`

**Notes**:
- Endpoint typos preserved: `filter_annual_revunue`, `filter_job_oppertunities`
- All endpoints use same header structure
- Filter endpoints that accept `query` parameter: geography, company, industry, job_title, technology
- Filter endpoints with empty body: all others

---

**Last Updated**: 2025-01-14
