/**
 * Test script for daily DNC check endpoint
 * 
 * This simulates what the cron job will do
 */

async function testDailyDncCheck() {
  console.log('🧪 Testing Daily DNC Check Endpoint\n');
  console.log('='.repeat(60));
  
  try {
    // In development, you can test locally
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const endpoint = `${baseUrl}/api/daily-dnc-check`;
    
    console.log(`\n📡 Calling: ${endpoint}\n`);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Add cron secret if configured
        ...(process.env.CRON_SECRET && {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`
        }),
      },
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}\n`);
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Daily DNC Check Results:');
      console.log(`   Total leads: ${result.totalLeads || 0}`);
      console.log(`   Leads with phone: ${result.leadsWithPhone || 0}`);
      console.log(`   Checked: ${result.checked || 0}`);
      console.log(`   Updated: ${result.updated || 0}`);
      console.log(`   DNC count: ${result.dncCount || 0}`);
      console.log(`   OK count: ${result.okCount || 0}`);
      console.log(`   Duration: ${result.duration || 'N/A'}`);
      console.log(`   Message: ${result.message || 'Success'}`);
    } else {
      console.error('❌ Error:', result.error || 'Unknown error');
    }
    
    console.log('\n' + '='.repeat(60));
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDailyDncCheck().catch(console.error);
