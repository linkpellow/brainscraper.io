// Search leads V2
// POST /search-employees-by-sales-nav-url
const url1 = 'https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data/playground/apiendpoint_7d0b8ed7-d025-446f-a16b-1e07ae90dd7a?_rsc=3br5k';

const options1 = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': 'YOUR_RAPIDAPI_KEY',
    'x-rapidapi-host': 'unknown.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    // Add your request body here
  })
};

try {
  const response1 = await fetch(url1, options1);
  const result1 = await response1.text();
  console.log(result1);
} catch (error) {
  console.error(error);
}


// Search Leads
// POST /search-employees
const url2 = 'https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data/playground/apiendpoint_f015adcb-0126-4ca6-8260-9912c1b9da5a?_rsc=1la0n';

const options2 = {
  method: 'POST',
  headers: {
    'x-rapidapi-key': 'YOUR_RAPIDAPI_KEY',
    'x-rapidapi-host': 'unknown.rapidapi.com',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    // Add your request body here
  })
};

try {
  const response2 = await fetch(url2, options2);
  const result2 = await response2.text();
  console.log(result2);
} catch (error) {
  console.error(error);
}
