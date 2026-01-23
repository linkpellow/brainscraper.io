/**
 * Dashboard Redirect
 * 
 * Redirects to main auth workers page
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/auth-workers');
  }, [router]);
  
  return null;
}
