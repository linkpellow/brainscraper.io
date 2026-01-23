# USHEALTH Application Type ID Mapper

## Endpoint
`POST /api/ushealth/application-type-mapper`

## Description
Discovers which `applicationTypeID` corresponds to which state by testing API calls with different state/zip combinations. Since USHEALTH is only licensed in 30 states, this utility maps each state to its corresponding `applicationTypeID`.

## Prerequisites
1. Create an auth worker by uploading a HAR file from `ezapp.ushealthgroup.com`
2. The HAR file should contain a valid session with cookies

## Request Body
```json
{
  "states": ["FL", "TX", "CA"],  // Optional: specific states to test (defaults to all 30 licensed states)
  "maxStates": 10                // Optional: limit number of states to test
}
```

### Parameters
- `states` (optional): Array of state codes to test. If not provided, tests all 30 licensed states
- `maxStates` (optional): Maximum number of states to test (useful for testing)

## Response
```json
{
  "success": true,
  "mapping": {
    "FL": 25,
    "TX": 12,
    "CA": 8,
    ...
  },
  "results": [
    {
      "state": "FL",
      "stateName": "Florida",
      "applicationTypeID": 25,
      "testedIds": [1, 2, 3, ..., 25],
      "successfulTests": [
        {
          "id": 25,
          "zipCode": "33101",
          "hasData": true
        }
      ]
    },
    ...
  ],
  "summary": {
    "totalStates": 30,
    "mappedStates": 28,
    "unmappedStates": ["AK", "HI"]
  }
}
```

## How It Works

1. **For each state**: Tests `applicationTypeID` values from 1-35
2. **For each ID**: Makes a POST request to `/ezAppMobileWebService.asmx/GetDataSetString`
3. **Validates response**: Checks if response contains product/plan data (not an error)
4. **Maps state to ID**: First successful ID for a state becomes its mapping
5. **Returns mapping**: Complete state → applicationTypeID mapping

## Usage Example

```bash
# Test all 30 licensed states
curl -X POST https://brainscraper.io/api/ushealth/application-type-mapper \
  -H "Content-Type: application/json" \
  -d '{}'

# Test specific states
curl -X POST https://brainscraper.io/api/ushealth/application-type-mapper \
  -H "Content-Type: application/json" \
  -d '{
    "states": ["FL", "TX", "CA"]
  }'

# Test first 5 states (for quick testing)
curl -X POST https://brainscraper.io/api/ushealth/application-type-mapper \
  -H "Content-Type: application/json" \
  -d '{
    "maxStates": 5
  }'
```

## Performance

- **Optimized**: Tests IDs 1-35 (not 1-50) since only 30 states are licensed
- **Early exit**: Stops testing once a valid ID is found for a state
- **Rate limiting**: Includes delays between requests to avoid overwhelming the API
- **Efficient**: Uses primary zip code first, then validates with additional zips

## Expected Results

Since USHEALTH is licensed in 30 states, you should get:
- **30 mapped states** with their corresponding `applicationTypeID`
- Each state should have exactly one `applicationTypeID` that returns valid product data
- The IDs will likely be sequential or follow a pattern (e.g., 1-30, but not necessarily)

## Integration

Once you have the mapping, you can use it in the quote API:

```json
{
  "zipCode": "33101",
  "state": "FL",
  "applicationTypeID": 25  // From mapping
}
```
