/**
 * Decode and analyze JWT token
 */

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlM2FkZjhjNC04ZWM2LTQ1YzctYTI3MC1iMmJmYjAyMThlNjAiLCJzdWIiOiI1RjlFMjBGQS1FMEQzLTQwQzQtQTUzMS0wREIzOTAwN0Q4REEiLCJ1bmlxdWVfbmFtZSI6IkxJTksuUEVMTE9XQHVzaGFkdmlzb3JzLmNvbSIsIk5hbWUiOiJMSU5LLlBFTExPV0B1c2hhZHZpc29ycy5jb20iLCJFbWFpbCI6IkxJTksuUEVMTE9XQHVzaGFkdmlzb3JzLmNvbSIsIkFnZW50TnVtYmVyIjoiMDAwNDQ0NDciLCJDdXJyZW50Q29udGV4dEFnZW50TnVtYmVyIjoiMDAwNDQ0NDciLCJDdXJyZW50Q29udGV4dEFnZW50SUQiOiI0MjY5MiIsIkN1cnJlbnRDb250ZXh0QWdlbmN5VGl0bGUiOiJXQSIsIklkIjoiNUY5RTIwRkEtRTBEMy00MEM0LUE1MzEtMERCMzkwMDdEOERBIiwiZXhwIjoxNzY1OTMwMTIxLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjUxMzcwIiwiYXVkIjoiaHR0cDovL2xvY2FsaG9zdDo1MTM3MCJ9.UVgVzF1QEKl8wSrjQji2qN3VEtoKx1wiID_ExqOApuM";

function decodeJWT(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const signature = parts[2];

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  const isExpired = payload.exp ? payload.exp < now : false;
  const expiresAt = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;

  return {
    header,
    payload,
    signature,
    isExpired,
    expiresAt,
    expiresIn: payload.exp ? Math.max(0, payload.exp - now) : null,
  };
}

const decoded = decodeJWT(token);

console.log('\n🔑 JWT TOKEN ANALYSIS\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 HEADER:');
console.log(JSON.stringify(decoded.header, null, 2));
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 PAYLOAD:');
console.log(JSON.stringify(decoded.payload, null, 2));
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⏰ EXPIRATION:');
console.log(`Expires At: ${decoded.expiresAt || 'N/A'}`);
console.log(`Is Expired: ${decoded.isExpired ? '❌ YES' : '✅ NO'}`);
if (decoded.expiresIn !== null) {
  const hours = Math.floor(decoded.expiresIn / 3600);
  const minutes = Math.floor((decoded.expiresIn % 3600) / 60);
  console.log(`Expires In: ${hours}h ${minutes}m`);
}
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👤 USER INFO:');
console.log(`Email: ${decoded.payload.Email || decoded.payload.unique_name || 'N/A'}`);
console.log(`Agent Number: ${decoded.payload.AgentNumber || 'N/A'}`);
console.log(`Agent ID: ${decoded.payload.CurrentContextAgentID || 'N/A'}`);
console.log(`Agency: ${decoded.payload.CurrentContextAgencyTitle || 'N/A'}`);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔑 FULL TOKEN:');
console.log(token);
console.log('\n');
