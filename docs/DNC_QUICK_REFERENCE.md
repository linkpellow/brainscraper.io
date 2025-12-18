# DNC Scrubbing Quick Reference

## 🚀 Quick Start

### 1. Setup Environment

```bash
# .env.local
USHA_JWT_TOKEN=your_jwt_token_here
```

### 2. Basic Usage

```typescript
import { checkDNCStatus } from '@/utils/enrichData';

const result = await checkDNCStatus('2143493972');
// { isDNC: true, canContact: false, reason: 'State DNC' }
```

### 3. Batch Processing

```typescript
// API Route
POST /api/usha/scrub-batch
Body: { phones: ['2143493972', '2694621403'] }
```

---

## 📋 Constants

```typescript
const USHA_DNC_API_BASE = 'https://api-business-agent.ushadvisors.com';
const DNC_ENDPOINT = '/Leads/api/leads/scrubphonenumber';
const currentContextAgentNumber = '00044447';
```

---

## 🔑 Token Management

```typescript
import { getUshaToken, clearTokenCache } from '@/utils/getUshaToken';

// Get token (cached)
const token = await getUshaToken();

// Force refresh
const freshToken = await getUshaToken(null, true);

// Clear cache
clearTokenCache();
```

---

## 📡 API Request

```typescript
const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=00044447&phone=2143493972`;

const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'accept': 'application/json, text/plain, */*',
    'Referer': 'https://agent.ushadvisors.com/',
    'Content-Type': 'application/json',
  }
});
```

---

## 📦 Response Format

```json
{
  "status": "Success",
  "data": {
    "phoneNumber": "2694621403",
    "contactStatus": {
      "canContact": false,
      "reason": "Federal DNC"
    },
    "isDoNotCall": true
  }
}
```

**Parse**:
- `isDNC` = `data.isDoNotCall === true`
- `canContact` = `data.contactStatus.canContact !== false`
- `reason` = `data.contactStatus.reason`

---

## 🔄 Auto-Refresh Pattern

```typescript
let response = await fetch(url, { method: 'GET', headers });

if (response.status === 401 || response.status === 403) {
  clearTokenCache();
  const freshToken = await getUshaToken(null, true);
  if (freshToken) {
    headers = { ...headers, 'Authorization': `Bearer ${freshToken}` };
    response = await fetch(url, { method: 'GET', headers });
  }
}
```

---

## 🧪 Testing

```bash
# Comprehensive test
npx tsx scripts/test-dnc-complete-verification.ts

# Quick test
npx tsx scripts/test-usha-dnc-direct.ts
```

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| Token not found | Set `USHA_JWT_TOKEN` in `.env.local` |
| 401 Unauthorized | Token expired - auto-refreshes automatically |
| Invalid phone | Use 10+ digits, remove formatting |
| Rate limiting | Add delays between requests |

---

## 📁 Key Files

- `utils/enrichData.ts` - Core DNC functions
- `utils/getUshaToken.ts` - Token management
- `app/api/usha/scrub-batch/route.ts` - Batch API endpoint

---

**Full Documentation**: See `docs/DNC_SCRUBBING_IMPLEMENTATION.md`
