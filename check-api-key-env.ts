/**
 * Check if RAPIDAPI_KEY environment variable is set correctly
 */

console.log('🔍 API Key Environment Check\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const key = process.env.RAPIDAPI_KEY;

if (!key) {
  console.log('❌ RAPIDAPI_KEY is NOT SET in environment');
  console.log('\nTo set it:');
  console.log('  Local: Add to .env.local file');
  console.log('  Production: Set in Railway/Vercel environment variables');
} else {
  console.log('✅ RAPIDAPI_KEY is set');
  console.log(`   Length: ${key.length} characters`);
  console.log(`   First 20 chars: ${key.substring(0, 20)}...`);
  console.log(`   Last 10 chars: ...${key.substring(key.length - 10)}`);
  console.log(`   Format: ${key.match(/^[a-z0-9]+$/i) ? '✅ Valid format' : '❌ Invalid format'}`);
  
  // Check if it matches the hardcoded test key
  const testKey = '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';
  if (key === testKey) {
    console.log('\n⚠️  WARNING: Using hardcoded test key from code');
    console.log('   This might not be your actual Pro subscription key!');
    console.log('   Check your RapidAPI dashboard for the correct key.');
  } else {
    console.log('\n✅ Using environment variable key (not hardcoded)');
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n💡 To verify your Pro subscription key:');
console.log('   1. Go to https://rapidapi.com/developer/dashboard');
console.log('   2. Check your API key');
console.log('   3. Verify it matches what\'s in your .env.local (local)');
console.log('   4. Verify it matches what\'s in Railway/Vercel (production)');
