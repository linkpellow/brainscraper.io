/**
 * Test script to check if Fresh LinkedIn API returns job change dates
 * Run with: npx tsx test-linkedin-job-dates.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local file
config({ path: resolve(process.cwd(), '.env.local') });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

if (!RAPIDAPI_KEY) {
  console.error('RAPIDAPI_KEY not found in environment variables');
  process.exit(1);
}

async function testLinkedInProfile(linkedinUrl: string) {
  console.log(`\nTesting LinkedIn URL: ${linkedinUrl}\n`);
  
  const url = `https://fresh-linkedin-profile-data.p.rapidapi.com/enrich-lead?linkedin_url=${encodeURIComponent(linkedinUrl)}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error: ${response.status} ${response.statusText}`);
      console.error(errorText);
      return;
    }

    const result = await response.text();
    let data: any;
    try {
      data = JSON.parse(result);
    } catch {
      console.error('Failed to parse JSON response');
      console.log('Raw response:', result.substring(0, 500));
      return;
    }

    // Look for date-related fields
    console.log('=== SEARCHING FOR DATE FIELDS ===\n');
    
    // Check for experience/positions array
    if (data.experience || data.positions || data.workExperience) {
      const experiences = data.experience || data.positions || data.workExperience;
      console.log('Found experience/positions:', Array.isArray(experiences) ? experiences.length : 'not an array');
      if (Array.isArray(experiences) && experiences.length > 0) {
        console.log('\nFirst experience entry:');
        console.log(JSON.stringify(experiences[0], null, 2));
      }
    }

    // Check for current position
    if (data.currentPosition || data.current_position) {
      const currentPos = data.currentPosition || data.current_position;
      console.log('\n=== CURRENT POSITION ===');
      console.log(JSON.stringify(currentPos, null, 2));
    }

    // Search for any date fields recursively
    function findDateFields(obj: any, path: string = ''): void {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key in obj) {
        const currentPath = path ? `${path}.${key}` : key;
        const value = obj[key];
        
        // Check if key contains date-related terms
        if (key.toLowerCase().includes('date') || 
            key.toLowerCase().includes('start') || 
            key.toLowerCase().includes('end') ||
            key.toLowerCase().includes('updated') ||
            key.toLowerCase().includes('change') ||
            key.toLowerCase().includes('time')) {
          console.log(`\nFound date-related field: ${currentPath}`);
          console.log(`Value: ${JSON.stringify(value)}`);
        }
        
        // Recursively search nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          findDateFields(value, currentPath);
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              findDateFields(item, `${currentPath}[${index}]`);
            }
          });
        }
      }
    }

    console.log('\n=== ALL DATE-RELATED FIELDS ===');
    findDateFields(data);

    // Also print full structure keys for reference
    console.log('\n=== TOP-LEVEL KEYS ===');
    console.log(Object.keys(data).join(', '));

  } catch (error) {
    console.error('Error:', error);
  }
}

// Test with first LinkedIn URL from CSV
const testUrl = 'https://www.linkedin.com/in/ACwAAAHCdNQBMfYbu31uB_7TN9THLrA_rUP5EKI';
testLinkedInProfile(testUrl);
