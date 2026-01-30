import { useContext } from 'react';
import { DncAuthContext } from './DncAuthProvider';

export function useDncAuth() {
  const context = useContext(DncAuthContext);
  if (!context) {
    throw new Error('useDncAuth must be used within DncAuthProvider');
  }
  return context;
}
