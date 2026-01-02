# Inngest Testing Commands

Run these commands in your browser console (F12 → Console tab) on https://brainscraper.io

## 1. Check Inngest Configuration

```javascript
// Check if Inngest endpoint is accessible
fetch('/api/jobs/test-inngest')
  .then(r => r.json())
  .then(data => {
    console.log('✅ Inngest Test:', data);
    console.log('Event Key Present:', data.eventKeyPresent);
    console.log('Signing Key Present:', data.signingKeyPresent);
  })
  .catch(err => console.error('❌ Error:', err));
```

## 2. Check Debug Information

```javascript
// Get comprehensive debug info
fetch('/api/jobs/debug')
  .then(r => r.json())
  .then(data => {
    console.log('🔍 Debug Info:', data);
    console.log('Active Jobs:', data.diagnostics?.jobs?.active);
    console.log('Stuck Jobs:', data.diagnostics?.stuckJobs);
    console.log('Recommendations:', data.diagnostics?.recommendations);
  })
  .catch(err => console.error('❌ Error:', err));
```

## 3. Check Active Jobs

```javascript
// Check current job status
fetch('/api/jobs/status?activeOnly=true')
  .then(r => r.json())
  .then(data => {
    console.log('📊 Active Jobs:', data);
    data.jobs?.forEach(job => {
      console.log(`Job ${job.jobId}: ${job.status} (${job.progress?.current}/${job.progress?.total})`);
    });
  })
  .catch(err => console.error('❌ Error:', err));
```

## 4. Test Sending an Event to Inngest

```javascript
// Test if we can send events to Inngest
fetch('/api/jobs/test-inngest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
})
  .then(r => r.json())
  .then(data => {
    console.log('📤 Test Event Result:', data);
    if (data.success) {
      console.log('✅ Event sent successfully!');
    } else {
      console.error('❌ Failed to send event:', data.error);
    }
  })
  .catch(err => console.error('❌ Error:', err));
```

## 5. Check Inngest Endpoint (Function Sync)

```javascript
// Check if Inngest can see our functions
fetch('/api/inngest')
  .then(r => r.text())
  .then(data => {
    console.log('🔗 Inngest Endpoint Response:', data.substring(0, 500));
    console.log('✅ If you see function info, Inngest can sync');
  })
  .catch(err => console.error('❌ Error:', err));
```

## 6. Fail Stuck Jobs

```javascript
// Mark all stuck pending jobs as failed
fetch('/api/jobs/fail-stuck', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'fail-stuck', timeoutMinutes: 5 })
})
  .then(r => r.json())
  .then(data => {
    console.log('🗑️ Fail Stuck Jobs Result:', data);
    console.log(`Failed ${data.failed} stuck job(s)`);
  })
  .catch(err => console.error('❌ Error:', err));
```

## 7. Full Diagnostic Test

```javascript
// Run all tests in sequence
async function runAllTests() {
  console.log('🧪 Starting Inngest Diagnostic Tests...\n');
  
  // Test 1: Configuration
  console.log('1️⃣ Testing Inngest Configuration...');
  const config = await fetch('/api/jobs/test-inngest').then(r => r.json());
  console.log('   Event Key:', config.eventKeyPresent ? '✅' : '❌');
  console.log('   Signing Key:', config.signingKeyPresent ? '✅' : '❌');
  
  // Test 2: Endpoint
  console.log('\n2️⃣ Testing Inngest Endpoint...');
  try {
    const endpoint = await fetch('/api/inngest').then(r => r.text());
    console.log('   Endpoint accessible:', endpoint.length > 0 ? '✅' : '❌');
  } catch (e) {
    console.log('   Endpoint accessible: ❌', e.message);
  }
  
  // Test 3: Active Jobs
  console.log('\n3️⃣ Checking Active Jobs...');
  const jobs = await fetch('/api/jobs/status?activeOnly=true').then(r => r.json());
  console.log(`   Active Jobs: ${jobs.jobs?.length || 0}`);
  jobs.jobs?.forEach(job => {
    const age = Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000);
    console.log(`   - ${job.jobId}: ${job.status} (${age} minutes old)`);
  });
  
  // Test 4: Send Test Event
  console.log('\n4️⃣ Testing Event Send...');
  const testResult = await fetch('/api/jobs/test-inngest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }).then(r => r.json());
  console.log('   Event Send:', testResult.success ? '✅' : '❌', testResult.message || testResult.error);
  
  // Test 5: Debug Info
  console.log('\n5️⃣ Getting Debug Info...');
  const debug = await fetch('/api/jobs/debug').then(r => r.json());
  console.log('   Stuck Jobs:', debug.diagnostics?.stuckJobs?.length || 0);
  if (debug.diagnostics?.recommendations?.length > 0) {
    console.log('   Recommendations:');
    debug.diagnostics.recommendations.forEach(rec => console.log(`   - ${rec}`));
  }
  
  console.log('\n✅ Diagnostic tests complete!');
  return { config, jobs, testResult, debug };
}

// Run it
runAllTests();
```

## 8. Monitor Job Status (Real-time)

```javascript
// Poll job status every 2 seconds
let pollCount = 0;
const pollInterval = setInterval(async () => {
  pollCount++;
  const jobs = await fetch('/api/jobs/status?activeOnly=true').then(r => r.json());
  console.log(`[${pollCount}] Active Jobs:`, jobs.jobs?.map(j => ({
    id: j.jobId.substring(0, 20) + '...',
    status: j.status,
    progress: `${j.progress?.current}/${j.progress?.total}`
  })));
  
  if (jobs.jobs?.length === 0 || jobs.jobs?.every(j => j.status !== 'pending' && j.status !== 'running')) {
    console.log('✅ All jobs completed or failed');
    clearInterval(pollInterval);
  }
}, 2000);

// Stop polling after 60 seconds
setTimeout(() => {
  clearInterval(pollInterval);
  console.log('⏹️ Stopped polling');
}, 60000);
```

## Quick One-Liner Tests

```javascript
// Quick config check
fetch('/api/jobs/test-inngest').then(r=>r.json()).then(d=>console.log('Config:',d))

// Quick job check  
fetch('/api/jobs/status?activeOnly=true').then(r=>r.json()).then(d=>console.log('Jobs:',d.jobs))

// Quick debug
fetch('/api/jobs/debug').then(r=>r.json()).then(d=>console.log('Debug:',d.diagnostics))

// Test event send
fetch('/api/jobs/test-inngest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json()).then(d=>console.log('Test:',d))
```

