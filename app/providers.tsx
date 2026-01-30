'use client';

import { DncAuthProvider } from '@/src/features/dnc/DncAuthProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <DncAuthProvider>{children}</DncAuthProvider>;
}
