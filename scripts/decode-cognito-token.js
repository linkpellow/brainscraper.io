/**
 * Decode Cognito JWT Token
 * 
 * Decodes the Cognito token to see expiration and claims
 */

(function() {
  'use strict';
  
  // Token from the network request
  const token = "eyJraWQiOiJ2MXFORUVzVjdBQ1Biamp1MVZEWVp2dXlrSGJoZFlta0FBTU81NnpKS1FBPSIsImFsZyI6IlJTMjU2In0.eyJjdXN0b206bWFya2V0cGxhY2UiOiJ1c2hhX2dyZWlmIiwic3ViIjoiNzQ1Y2E3M2QtMzI0Yi00MzUwLWEwYTktZDE1MWYxMTdmOTgyIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImN1c3RvbTpjb3JwIjoidXNoYSIsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy1lYXN0LTEuYW1hem9uYXdzLmNvbVwvdXMtZWFzdC0xX1NXbUZ6dm5rdSIsInBob25lX251bWJlcl92ZXJpZmllZCI6ZmFsc2UsImNvZ25pdG86dXNlcm5hbWUiOiI3NDVjYTczZC0zMjRiLTQzNTAtYTBhOS1kMTUxZjExN2Y5ODIiLCJnaXZlbl9uYW1lIjoiTGluayIsImN1c3RvbTpjb21wYW55IjoidXNoYV9ncmVpZiIsImF1ZCI6IjVkcm9tc3Jub3BpZW5tcWE4M2JhNG45MjdoIiwiY3VzdG9tOm1lcmNoYW50IjoiY3VzX1JocWQ4bGJEcWdVSFBXIiwiY3VzdG9tOm5ldHdvcmsiOiJkMDA4NTA2NS00OWY0LTRkZWQtYjI0NC0yM2IwNjNlMzE0MDUiLCJjdXN0b206bWFuYWdlcklEcyI6IltcInVzLWVhc3QtMToyMjlmMDA0OC0wMTUzLTQxNmYtYmZlOS04NDg2OTQ0NDlkZDVcIl0iLCJldmVudF9pZCI6Ijk4M2NkNmY2LWExMzItNDMyYy04ZWM5LWZiZTRhYzI4MjZhNSIsInRva2VuX3VzZSI6ImlkIiwiYXV0aF90aW1lIjoxNzY2MDgyNDk1LCJwaG9uZV9udW1iZXIiOiIrMTI2OTQ2MjE0MDMiLCJleHAiOjE3NjYwODk2OTUsImN1c3RvbTpidXllciI6IjBhOTFkYzQ2LThlZDMtNGMzNy04ZGI2LTQ1ZmM4OWYxMDBiNCIsImlhdCI6MTc2NjA4MjQ5NSwiZmFtaWx5X25hbWUiOiJQZWxsb3ciLCJlbWFpbCI6ImxpbmtwZWxsb3dpbnN1cmFuY2VAZ21haWwuY29tIn0.C1df8GWMGrQIGgBgJvxtdZ35eT8TRlZmi7gRl7gHL8rwF10lMv6yNOHRwTsjn3Ga-0fQPDRY6prPR1n1AxZvKdmS00k3UiUm0uHRIULlFZSD57nO2YDBX73yFhGoIe-I_lINoP9iqyo-WcaScCmNI6ZWk463gPOUCB3DeHEMeavox7ZelwDksA_H3hvQDB0dvJZg_ykAN7lRphbXFLksPbGK23z2WvQLBqQHFtBxw17XsxdGND7B1tqPdJUzvmudURwvGgMMMzfXJJk-YxwDOjKgyQX7_mU5-XNXekseXKXLVEPjZ8n2p9j641D5B_DuRpEor23ajzf9Ri7ymYxhpA";
  
  function decodeJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      return { header, payload };
    } catch (e) {
      console.error('Error decoding JWT:', e);
      return null;
    }
  }
  
  const decoded = decodeJWT(token);
  
  if (!decoded) {
    console.log('❌ Failed to decode token');
    return;
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 COGNITO TOKEN ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('📋 HEADER:');
  console.log(JSON.stringify(decoded.header, null, 2));
  console.log('');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 PAYLOAD:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(JSON.stringify(decoded.payload, null, 2));
  console.log('');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⏰ EXPIRATION:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const exp = decoded.payload.exp;
  const iat = decoded.payload.iat;
  const authTime = decoded.payload.auth_time;
  
  if (exp) {
    const expDate = new Date(exp * 1000);
    console.log(`Expires: ${expDate.toISOString()}`);
    console.log(`Expires: ${expDate.toLocaleString()}`);
    const now = Date.now();
    const expiresIn = exp * 1000 - now;
    console.log(`Expires in: ${Math.floor(expiresIn / 1000 / 60)} minutes`);
  }
  
  if (iat) {
    const iatDate = new Date(iat * 1000);
    console.log(`Issued at: ${iatDate.toISOString()}`);
  }
  
  if (authTime) {
    const authDate = new Date(authTime * 1000);
    console.log(`Auth time: ${authDate.toISOString()}`);
  }
  
  console.log('');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 KEY INFORMATION:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`Cognito User Pool: ${decoded.payload.iss}`);
  console.log(`User ID: ${decoded.payload.sub}`);
  console.log(`Email: ${decoded.payload.email}`);
  console.log(`Username: ${decoded.payload['cognito:username']}`);
  console.log(`Client ID: ${decoded.payload.aud}`);
  console.log('');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 AUTOMATION STRATEGY:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('This is AWS Cognito authentication, not OAuth 2.0.');
  console.log('For automation, you need to:');
  console.log('');
  console.log('1. Use AWS Cognito SDK to authenticate');
  console.log('2. Use username/password to get tokens');
  console.log('3. Use refresh tokens to get new access tokens');
  console.log('');
  console.log('Cognito User Pool ID: us-east-1_SWmFzvnku');
  console.log('Cognito Client ID: 5dromsrnopienmqa83ba4n927h');
  console.log('');
  console.log('Next: Capture the Cognito authentication flow during login.\n');
  
  return decoded;
})();
