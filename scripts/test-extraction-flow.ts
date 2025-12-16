/**
 * Test the actual extraction and enrichment flow to find the root cause
 */

// Simulate what happens during enrichment
const testRow = {
  'Name': 'Test User',
  'Email': 'test@example.com',
  'Phone': '1234567890',
  'First Name': 'Test',
  'Last Name': 'User',
  'City': 'Denver',
  'State': 'Colorado',
  'Zip': '',
};

const testHeaders = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Email', 'Phone', 'First Name', 'Last Name', 'City', 'State', 'Zip', 'Search Filter'];

// Simulate isPhoneColumn check
function isPhoneColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('phone') || lower.includes('tel') || lower.includes('mobile') || lower === 'phone';
}

// Simulate extractPhone from enrichData.ts
function extractPhone(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isPhoneColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value) {
        const cleaned = value.replace(/[^\d+]/g, '');
        if (cleaned.length >= 10) {
          return cleaned;
        }
      }
    }
  }
  return null;
}

// Simulate extractPhone from extractLeadSummary.ts
function extractPhoneFromSummary(row: any, enriched: any): string {
  const phone = row['Phone'] || row['phone'] || row['Phone Number'] || row['PhoneNumber'] || row['phone_number'] || row['Mobile'] || row['mobile'] || row['Primary Phone'] || row['PrimaryPhone'] || '';
  if (phone) return String(phone);
  
  if (enriched?.phone) {
    return String(enriched.phone);
  }
  
  return '';
}

console.log('🧪 Testing extraction flow...\n');

console.log('1. Row data:');
console.log(JSON.stringify(testRow, null, 2));
console.log('\n2. Headers:');
console.log(testHeaders);
console.log('\n3. isPhoneColumn("Phone"):', isPhoneColumn('Phone'));
console.log('4. extractPhone (enrichData):', extractPhone(testRow, testHeaders));
console.log('5. extractPhoneFromSummary (extractLeadSummary):', extractPhoneFromSummary(testRow, {}));

// Test with enriched object
const testEnriched = {
  phone: '9876543210',
  email: 'enriched@example.com',
};

console.log('6. extractPhoneFromSummary with enriched:', extractPhoneFromSummary(testRow, testEnriched));

console.log('\n✅ Test complete');
