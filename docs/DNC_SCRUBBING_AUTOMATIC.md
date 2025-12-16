# Automatic DNC Scrubbing - One by One

## Overview

The automatic DNC scrubbing feature processes leads one by one in the background using the USHA single phone API endpoint. Each phone number is checked individually and DNC status fields are automatically populated in the CSV.

## Usage

### Command Line

```bash
# Basic usage (outputs to input_file_DNC_SCRUBBED.csv)
npx tsx scripts/dnc-scrub-leads-one-by-one.ts <input-csv-path>

# Specify output file
npx tsx scripts/dnc-scrub-leads-one-by-one.ts <input-csv-path> <output-csv-path>

# Using npm script
npm run dnc-scrub <input-csv-path> [output-csv-path]
```

### Examples

```bash
# Scrub leads from enriched CSV
npx tsx scripts/dnc-scrub-leads-one-by-one.ts "app/Untitled spreadsheet - filtered_leads_by_phone_FIXED_ENRICHED.csv"

# Custom output file
npx tsx scripts/dnc-scrub-leads-one-by-one.ts app/leads.csv app/leads-dnc-scrubbed.csv
```

## How It Works

1. **Reads CSV file** - Parses the input CSV using papaparse
2. **Finds phone numbers** - Looks for phone numbers in multiple column formats:
   - `phone`, `Phone`
   - `primaryPhone`, `PrimaryPhone`
   - `phoneNumber`, `PhoneNumber`
   - `mobile`, `Mobile`
   - `_matched_phone_10`
3. **Scrubs one by one** - For each lead with a phone number:
   - Calls USHA API: `GET /Leads/api/leads/scrubphonenumber`
   - Waits 500ms between requests (rate limiting)
   - Populates DNC fields
4. **Saves results** - Writes updated CSV with DNC fields

## DNC Fields Added

The script automatically adds these columns to your CSV:

| Column | Values | Description |
|--------|--------|-------------|
| `dncStatus` | `Safe`, `Do Not Call`, `Unknown`, `Error` | Overall DNC status |
| `isDoNotCall` | `Yes`, `No`, `Unknown` | Whether number is on DNC list |
| `canContact` | `Yes`, `No`, `Unknown` | Whether contact is allowed |
| `dncReason` | `Federal DNC`, `State DNC`, etc. | Reason for DNC status |

## Output Example

```
Phone Number: 3523394612
dncStatus: Do Not Call
isDoNotCall: Yes
canContact: No
dncReason: State DNC
```

## Statistics

After processing, the script displays:

- Total Leads
- With Phone (leads that have phone numbers)
- Processed (successfully scrubbed)
- Skipped (no phone number)
- Do Not Call count
- Safe to Call count
- Errors count

## Token Management

Currently uses the authenticated token hardcoded in the script. Automatic token handling will be added later.

To use a different token:
1. Add `USHA_JWT_TOKEN=your-token` to `.env.local`
2. Or modify `AUTHENTICATED_TOKEN` in the script

## Rate Limiting

- 500ms delay between requests
- Prevents API rate limiting
- Adjust `DELAY_BETWEEN_REQUESTS` constant if needed

## Error Handling

- Invalid phone numbers: Marked as "Unknown"
- API errors: Marked as "Error" with error message
- Missing phone: Skipped with "No phone number" reason
- Network errors: Retry logic can be added

## Integration

This script can be:
- Run manually from command line
- Integrated into CI/CD pipelines
- Called from other scripts
- Scheduled as a cron job

## Future Enhancements

- [ ] Automatic token refresh
- [ ] Retry logic for failed requests
- [ ] Progress saving (resume capability)
- [ ] Batch processing optimization
- [ ] Integration with UI for real-time updates
