# USHA DNC Scrubbing Integration Guide

This guide explains how to use the USHA (United States Health Advisors) bulk lead scrubbing feature in brainscraper.io.

## Overview

The USHA integration allows you to:
- Upload CSV files with lead data
- Automatically scrub phone numbers for DNC (Do-Not-Call) status
- Check contact eligibility
- View detailed scrub results row-by-row

## CSV Format Requirements

Your CSV must include these columns (headers must match exactly):

| CSV Header | USHA Field | Required |
|------------|------------|----------|
| First Name | FirstName | Yes |
| Last Name | LastName | Yes |
| City | City | Yes |
| State | State | Yes |
| Zip | Zip | Yes |
| Date Of Birth | DateOfBirth | Yes |
| House hold Income | HouseholdIncome | Yes |
| Primary Phone | PrimaryPhone | Yes |

**Example CSV:**
```csv
First Name,Last Name,City,State,Zip,Date Of Birth,House hold Income,Primary Phone
John,Doe,Miami,FL,33101,01/15/1985,55000,5554441212
Sarah,Smith,Dallas,TX,75201,09/20/1990,72000,9725558877
```

## Authentication

### Option 1: Environment Variable (Recommended)
Add to `.env.local`:
```
USHA_JWT_TOKEN=your-jwt-token-here
```

### Option 2: Manual Entry
Enter your JWT token in the UI when using the DNC Scrub feature. The token is only used for that session.

## How to Use

1. **Upload Your CSV File**
   - Use the file upload interface
   - Your CSV will be parsed and displayed

2. **Click "DNC Scrub" Button**
   - Enter your USHA JWT token (if not in .env.local)
   - Click "Scrub Leads for DNC Status"
   - The system uploads your CSV to USHA and triggers scrubbing

3. **Check Results**
   - After upload, you'll receive a JobLogID
   - Click "Check Scrub Results" to view DNC status for each lead
   - Results show:
     - Phone number
     - DNC status (YES/NO)
     - Can Contact (YES/NO)
     - Reason for DNC status

## API Endpoints

The integration uses three USHA API endpoints:

1. **POST /api/usha/scrub** - Upload CSV and trigger scrubbing
2. **GET /api/usha/import-jobs** - List all import jobs
3. **GET /api/usha/import-log** - Get detailed scrub results by JobLogID

## Understanding DNC Results

- **isDoNotCall: true** - Phone number is on DNC list, cannot contact
- **canContact: false** - Lead cannot be contacted (may be DNC or other reason)
- **reason** - Explanation of why contact is/isn't allowed

## Notes

- Scrubbing happens server-side via USHA's API
- The CSV is uploaded directly to USHA (not stored locally)
- Results are fetched after scrubbing completes
- You can check results multiple times using the JobLogID

## Troubleshooting

**"USHA JWT token is required"**
- Add `USHA_JWT_TOKEN` to `.env.local` or enter token manually in UI

**"CSV file is required"**
- Make sure you've uploaded a file before clicking DNC Scrub

**"JobLogID not found"**
- The upload may have succeeded but the response format may differ
- Check the USHA API documentation for the exact response structure

