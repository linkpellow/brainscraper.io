/**
 * API Mapping Page - REDIRECT
 * 
 * This page has been consolidated into the session detail page.
 * Redirects to the session detail page which now contains:
 * - Auth Summary
 * - Endpoint Catalog
 * - All endpoint browsing functionality
 */

'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function MapApiPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params?.sessionId as string;
  const selectedEndpointId = searchParams?.get('endpoint');
  
  // Redirect to session detail page (functionality moved there)
  useEffect(() => {
    if (sessionId) {
      // If endpoint is selected, redirect to test page
      if (selectedEndpointId) {
        router.replace(`/auth-workers/${sessionId}/map-api/test?endpoint=${selectedEndpointId}`);
      } else {
        router.replace(`/auth-workers/${sessionId}`);
      }
    }
  }, [sessionId, selectedEndpointId, router]);
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-white/60">Redirecting...</div>
    </div>
  );
}
