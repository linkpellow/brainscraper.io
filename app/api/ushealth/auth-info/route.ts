/**
 * USHEALTH Authentication Info
 * 
 * Shows what authentication is needed and how to extract it
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromServer, listSessionsFromServer } from '../../../auth-workers/utils/authWorkerServerStorage';

export async function GET(request: NextRequest) {
  try {
    // Check for existing USHEALTH sessions
    const sessions = listSessionsFromServer();
    const ushealthSessions = sessions.filter(s => 
      s.targetDomain.includes('ushealthgroup.com') || 
      s.targetDomain.includes('ezapp')
    );
    
    const authInfo: any = {
      requiredAuth: {
        type: 'ASP.NET Session Cookie',
        cookieName: 'ASP.NET_SessionId',
        description: 'USHEALTH uses ASP.NET session-based authentication. You need the ASP.NET_SessionId cookie from an active session.',
        howToGet: [
          '1. Visit https://ezapp.ushealthgroup.com in your browser',
          '2. Log in or navigate to the quote page',
          '3. Open browser DevTools (F12) → Network tab',
          '4. Make a request (e.g., navigate to QuickQuoteMobile.aspx)',
          '5. Look at request headers → Cookie header',
          '6. Copy the ASP.NET_SessionId value',
          '7. Export HAR file (DevTools → Network → Right-click → Save all as HAR)',
          '8. Upload HAR file to /auth-workers page'
        ],
        alternativeMethods: [
          'Browser DevTools: Application → Cookies → ezapp.ushealthgroup.com',
          'Browser Extension: Cookie Editor or similar',
          'HAR File: Automatically extracted when uploaded to auth workers'
        ]
      },
      existingSessions: [],
      extractionStatus: 'no_session',
    };
    
    // Check existing sessions
    if (ushealthSessions.length > 0) {
      authInfo.extractionStatus = 'sessions_found';
      
      for (const sessionMeta of ushealthSessions) {
        const session = getSessionFromServer(sessionMeta.sessionId);
        if (!session) continue;
        
        // Try to extract cookies from HAR data
        let cookies: string[] = [];
        let cookieSource = 'none';
        
        try {
          const { getDataDirectory } = await import('@/utils/dataDirectory');
          const { promises: fs } = await import('fs');
          const path = await import('path');
          
          const dataDir = getDataDirectory();
          const harDataPath = path.join(dataDir, 'har-data', `${session.sessionId}.json`);
          
          try {
            const harDataContent = await fs.readFile(harDataPath, 'utf-8');
            const harData = JSON.parse(harDataContent);
            const cookieJar = harData.artifactBundle?.cookieJar?.timeline || [];
            
            for (const cookie of cookieJar) {
              if (cookie.domain.includes('ushealthgroup.com') || cookie.domain.includes('ezapp')) {
                cookies.push(`${cookie.cookieName}=${cookie.value}`);
                if (cookie.cookieName === 'ASP.NET_SessionId' || cookie.cookieName.includes('Session')) {
                  cookieSource = 'har_cookie_jar';
                }
              }
            }
          } catch (fileError: any) {
            if (fileError.code !== 'ENOENT') {
              console.warn('[AuthInfo] Could not load HAR data:', fileError);
            }
          }
        } catch (harError) {
          // Fallback to extracted vars
        }
        
        // Fallback: Check extracted vars
        if (cookies.length === 0 && session.step2?.extractedVars) {
          const extractedVars = session.step2.extractedVars;
          Object.keys(extractedVars).forEach(key => {
            if (key.toLowerCase().includes('session') || 
                key === 'ASP.NET_SessionId' ||
                key === 'ASP_NET_SessionId') {
              const value = extractedVars[key];
              if (value && typeof value === 'string' && value.length > 0) {
                const cookieName = key.replace(/_/g, '.');
                cookies.push(`${cookieName}=${value}`);
                cookieSource = 'extracted_vars';
              }
            }
          });
        }
        
        const hasASPNETSession = cookies.some(c => 
          c.includes('ASP.NET_SessionId') || c.includes('ASP_NET_SessionId')
        );
        
        authInfo.existingSessions.push({
          sessionId: session.sessionId,
          targetDomain: session.targetDomain,
          stabilizedAt: new Date(session.stabilizedAt).toISOString(),
          hasCookies: cookies.length > 0,
          cookieCount: cookies.length,
          hasASPNETSession,
          cookieSource,
          cookies: hasASPNETSession ? cookies.filter(c => c.includes('Session')) : [],
          status: hasASPNETSession ? 'ready' : 'missing_cookies',
        });
      }
    }
    
    // Summary
    const readySessions = authInfo.existingSessions.filter((s: any) => s.status === 'ready');
    if (readySessions.length > 0) {
      authInfo.summary = {
        status: 'ready',
        message: `Found ${readySessions.length} session(s) with ASP.NET_SessionId cookies. You can use the quote API now.`,
        recommendedSessionId: readySessions[0].sessionId,
      };
    } else if (ushealthSessions.length > 0) {
      authInfo.summary = {
        status: 'sessions_exist_but_no_cookies',
        message: 'Found session(s) but missing ASP.NET_SessionId cookies. Please upload a HAR file with active session cookies.',
      };
    } else {
      authInfo.summary = {
        status: 'no_sessions',
        message: 'No USHEALTH sessions found. Please create an auth worker by uploading a HAR file from ezapp.ushealthgroup.com',
        nextSteps: [
          '1. Visit https://ezapp.ushealthgroup.com and log in',
          '2. Export HAR file from browser DevTools',
          '3. Go to /auth-workers page',
          '4. Upload the HAR file',
          '5. Wait for processing to complete',
          '6. Run this endpoint again to verify cookies were extracted'
        ],
      };
    }
    
    return NextResponse.json({
      success: true,
      ...authInfo,
    });
    
  } catch (error) {
    console.error('[AuthInfo] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      requiredAuth: {
        type: 'ASP.NET Session Cookie',
        cookieName: 'ASP.NET_SessionId',
        description: 'USHEALTH uses ASP.NET session-based authentication',
      },
    }, { status: 500 });
  }
}
