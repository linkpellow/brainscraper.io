# USHA DNC Scrubbing - Quick Reference

## 🚀 Quick Start

### 1. Configure Token (One-Time Setup)

Add to `.env.local`:
```bash
COGNITO_REFRESH_TOKEN=your-refresh-token-here
```

### 2. Scrub a Phone Number

**Using API endpoint:**
```bash
curl "http://localhost:3000/api/usha/scrub-phone?phone=2143493972"
```

**Using standalone script:**
```bash
./scripts/scrub-phone.sh 2143493972
# or
npx tsx scripts/scrub-with-auto-refresh.ts 2143493972
```

### 3. Refresh Token Manually

```bash
npx tsx scripts/refresh-token.ts
```

---

## 📋 Standalone Scripts

### 1. Scrub Single Phone
```bash
# Bash
./scripts/scrub-phone.sh <phone-number> [agent-number]

# TypeScript
npx tsx scripts/scrub-with-auto-refresh.ts <phone-number> [agent-number]
```

### 2. Refresh Token
```bash
npx tsx scripts/refresh-token.ts
```

### 3. Scrub with Auto-Refresh (Hybrid)
```bash
npx tsx scripts/scrub-with-auto-refresh.ts <phone-number> [agent-number]
```

---

## 🔑 Token Configuration

### Recommended (Automatic Refresh)
```bash
COGNITO_REFRESH_TOKEN=eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUl...
```

### Alternative (Temporary)
```bash
USHA_JWT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📞 API Endpoints

### Single Phone Scrub
```
GET /api/usha/scrub-phone?phone=2143493972&currentContextAgentNumber=00044447
```

### Batch Phone Scrub
```
POST /api/usha/scrub-batch
Content-Type: application/json

{
  "phoneNumbers": ["2143493972", "2145551234"]
}
```

---

## ✅ Response Format

```json
{
  "success": true,
  "phone": "2143493972",
  "isDNC": false,
  "canContact": true,
  "status": "OK",
  "reason": null
}
```

---

## 🔄 Automatic Token Refresh

- ✅ Tokens refresh automatically on expiration
- ✅ 401 errors trigger automatic retry with refresh
- ✅ No manual intervention needed with `COGNITO_REFRESH_TOKEN`

---

## 📚 Full Documentation

See [USHA_DNC_SCRUBBING_COMPLETE.md](./USHA_DNC_SCRUBBING_COMPLETE.md) for complete documentation.
