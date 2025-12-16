/**
 * Verification script to test the actual enrichment process
 * Ensures all fields are properly mapped to output rows
 */

import { enrichData } from '../utils/enrichData';

async function main() {
  console.log('🧪 Testing Enrichment Process\n');
  console.log('='.repeat(70));

  // Create test data matching CSV structure
  const testData = {
    headers: [
      'Firstname',
      'Lastname',
      'City',
      'State',
      'Zipcode',
      'Phone',
      'Email',
      'Age',
      'Line Type',
      'Carrier'
    ],
    rows: [
      {
        Firstname: 'Chris',
        Lastname: 'Koeneman',
        City: 'Baltimore',
        State: 'Maryland',
        Zipcode: '',
        Phone: '',
        Email: '',
        Age: '',
        'Line Type': '',
        Carrier: ''
      }
    ]
  };

  console.log('\n📥 Input Row:');
  console.log(JSON.stringify(testData.rows[0], null, 2));

  console.log('\n⏳ Running enrichment...\n');

  try {
    const enriched = await enrichData(testData, (current, total) => {
      console.log(`Progress: ${current}/${total}`);
    });

    console.log('\n📤 Output Row:');
    const outputRow = enriched.rows[0];
    console.log(JSON.stringify(outputRow, null, 2));

    console.log('\n📊 Field Verification:\n');
    const checks = [
      { field: 'Firstname', value: outputRow.Firstname, expected: 'Chris' },
      { field: 'Lastname', value: outputRow.Lastname, expected: 'Koeneman' },
      { field: 'City', value: outputRow.City, expected: 'Baltimore' },
      { field: 'State', value: outputRow.State, expected: 'Maryland' },
      { field: 'Zipcode', value: outputRow.Zipcode, expected: '21201' },
      { field: 'Phone', value: outputRow.Phone, expected: '6145821526' },
      { field: 'Email', value: outputRow.Email, expected: 'chkoeneman@hotmail.com' },
      { field: 'Age', value: outputRow.Age, expected: '47' },
      { field: 'Line Type', value: outputRow['Line Type'], expected: 'mobile' },
      { field: 'Carrier', value: outputRow.Carrier, expected: 'Cingular Wireless/2' }
    ];

    let allPassed = true;
    for (const check of checks) {
      const passed = check.value === check.expected || (check.value && check.value !== '');
      const status = passed ? '✅' : '❌';
      console.log(`  ${status} ${check.field}: ${check.value || 'MISSING'} ${passed ? '' : `(expected: ${check.expected})`}`);
      if (!passed) allPassed = false;
    }

    console.log('\n' + '='.repeat(70));
    if (allPassed) {
      console.log('✅ ALL FIELDS MAPPED CORRECTLY');
    } else {
      console.log('❌ SOME FIELDS MISSING OR INCORRECT');
    }
    console.log('='.repeat(70));

    // Show enrichment metadata
    if (outputRow._enriched) {
      console.log('\n📋 Enrichment Metadata:');
      console.log(`  Phone Source: ${outputRow._enriched.phoneSource || 'N/A'}`);
      console.log(`  Email Source: ${outputRow._enriched.emailSource || 'N/A'}`);
      console.log(`  Has ZipCode: ${outputRow._enriched.zipCode ? 'YES' : 'NO'}`);
      console.log(`  Has Age: ${outputRow._enriched.age ? 'YES' : 'NO'}`);
      console.log(`  Has LineType: ${outputRow._enriched.lineType ? 'YES' : 'NO'}`);
      console.log(`  Has Carrier: ${outputRow._enriched.carrierName ? 'YES' : 'NO'}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    process.exit(1);
  }
}

main();
