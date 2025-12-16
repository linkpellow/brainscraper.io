// Search leads V2
// POST /search-employees-by-sales-nav-url
const url = 'https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data/playground/apiendpoint_7d0b8ed7-d025-446f-a16b-1e07ae90dd7a?_rsc=3br5k';

const options = {
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
  const response = await fetch(url, options);
  const result = await response.text();
  console.log(result);
} catch (error) {
  console.error(error);
}


// Search Leads
// POST /search-employees
const url = 'https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data/playground/apiendpoint_f015adcb-0126-4ca6-8260-9912c1b9da5a?_rsc=1la0n';

const options = {
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
  const response = await fetch(url, options);
  const result = await response.text();
  console.log(result);
} catch (error) {
  console.error(error);
}
