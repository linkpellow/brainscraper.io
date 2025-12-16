# LinkedIn API Test Results

Generated: 2025-11-30T22:04:58.709Z

## Summary

- **Total APIs Tested**: 7
- **Successful**: 5
- **APIs with Location Data**: 1
- **APIs with Geo IDs**: 0

## Detailed Results


### 1. LinkedIn Data API (rockapis) - By Username

**Endpoint**: `GET /api/linkedin-profile-by-username?username=adamselipsky`

**Status**: 200 ✅



**Location Data**: ❌ NO





**Response Structure**: 6 keys


**Sample Keys**:
- `success`
- `data`
- `data.success`
- `data.message`
- `data.data`
- `locationInfo`


**Full Response** (first 500 chars):
```json
{
  "success": true,
  "data": {
    "success": false,
    "message": "We are no longer providing this service at this time. If you need assistance, please contact support@professionalnetworkdata.com",
    "data": null
  },
  "locationInfo": null
}...
```


### 2. LinkedIn Sales Navigator - Search People

**Endpoint**: `POST /api/linkedin-sales-navigator`

**Status**: 200 ✅



**Location Data**: ✅ YES


**Location Fields Found**:
- data.response.data[0].geoRegion: "Guarulhos, São Paulo, Brazil"




**Response Structure**: 20 keys


**Sample Keys**:
- `success`
- `data`
- `data.success`
- `data.status`
- `data.response`
- `data.response.data`
- `data.response.data[0].firstName`
- `data.response.data[0].fullName`
- `data.response.data[0].lastName`
- `data.response.data[0].geoRegion`
- `data.response.data[0].profilePictureDisplayImage`
- `data.response.data[0].summary`
- `data.response.data[0].profileUrn`
- `data.response.data[0].navigationUrl`
- `data.response.data[0].openLink`
- `data.response.pagination`
- `data.response.pagination.total`
- `data.response.pagination.count`
- `data.response.pagination.start`
- `data.response.pagination.links`


**Full Response** (first 500 chars):
```json
{
  "success": true,
  "data": {
    "success": true,
    "status": 200,
    "response": {
      "data": [
        {
          "firstName": "Sérgio",
          "fullName": "Sérgio Seiva",
          "lastName": "Seiva",
          "geoRegion": "Guarulhos, São Paulo, Brazil",
          "profilePictureDisplayImage": "https://media.licdn.com/dms/image/v2/D4D03AQGQ1cz_gADPmA/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1706666015303?e=1766016000&v=beta&t=wnBbZT3vhqdibiU-PX...
```


### 3. Fresh LinkedIn Profile Data

**Endpoint**: `GET /api/fresh-linkedin-profile?linkedin_url=https://www.linkedin.com/in/adamselipsky/`

**Status**: 403 ❌



**Location Data**: ❌ NO





**Response Structure**: 2 keys


**Sample Keys**:
- `error`
- `details`


**Full Response** (first 500 chars):
```json
{
  "error": "RapidAPI error: Forbidden",
  "details": "{\"message\":\"You are not subscribed to this API.\"}"
}...
```


### 4. Fresh LinkedIn Company Data

**Endpoint**: `GET /api/fresh-linkedin-company?linkedin_url=https://www.linkedin.com/company/apple/`

**Status**: 429 ❌



**Location Data**: ❌ NO





**Response Structure**: 2 keys


**Sample Keys**:
- `error`
- `details`


**Full Response** (first 500 chars):
```json
{
  "error": "RapidAPI error: Too Many Requests",
  "details": "{\"message\":\"Too many requests\"}"
}...
```


### 5. LinkedIn Company (by domain) - rockapis

**Endpoint**: `GET /api/linkedin-company?domain=apple.com`

**Status**: 200 ✅



**Location Data**: ❌ NO





**Response Structure**: 3 keys


**Sample Keys**:
- `success`
- `message`
- `data`


**Full Response** (first 500 chars):
```json
{
  "success": false,
  "message": "We are no longer providing this service at this time. If you need assistance, please contact support@professionalnetworkdata.com",
  "data": null
}...
```


### 6. LinkedIn Profile (li-data-scraper)

**Endpoint**: `GET /api/linkedin-profile?url=https://www.linkedin.com/in/adamselipsky/`

**Status**: 200 ✅



**Location Data**: ❌ NO





**Response Structure**: 3 keys


**Sample Keys**:
- `success`
- `message`
- `data`


**Full Response** (first 500 chars):
```json
{
  "success": false,
  "message": "We are no longer providing this service at this time. If you need assistance, please contact support@professionalnetworkdata.com",
  "data": null
}...
```


### 7. LinkedIn Bulk Data Scraper

**Endpoint**: `GET /api/linkedin-scraper?url=https://www.linkedin.com/in/adamselipsky/&endpoint=profile`

**Status**: 200 ✅



**Location Data**: ❌ NO





**Response Structure**: 6 keys


**Sample Keys**:
- `success`
- `data`
- `data.success`
- `data.status`
- `data.health`
- `raw`


**Full Response** (first 500 chars):
```json
{
  "success": true,
  "data": {
    "success": true,
    "status": 200,
    "health": "100%"
  },
  "raw": "{\"success\":true,\"status\":200,\"health\":\"100%\"}"
}...
```

