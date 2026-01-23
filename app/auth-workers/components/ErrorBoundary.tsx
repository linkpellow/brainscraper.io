/**
 * Error Boundary Component
 * 
 * Catches React render errors and reports them to the error capture system
 */

'use client';

import { Component, type ReactNode } from 'react';
import { 
  createEnhancedErrorFromReactError,
  type EnhancedError,
  type ErrorBoundaryProps,
  type ErrorBoundaryState
} from '../utils/enhancedErrorCapture';
import { useConsoleCapture } from '../hooks/useConsoleCapture';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const enhanced = createEnhancedErrorFromReactError(error, errorInfo);
    this.props.onError(enhanced);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded">
          <h3 className="text-red-400 font-semibold">Something went wrong</h3>
          <p className="text-gray-400 text-sm mt-1">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ErrorBoundary({ children, fallback }: Props) {
  const { logs } = useConsoleCapture(true);

  const handleError = (error: EnhancedError) => {
    // Error is already logged by ErrorBoundaryClass
    // This is just for any additional handling if needed
    console.error('[ErrorBoundary] Caught error:', error);
  };

  return (
    <ErrorBoundaryClass onError={handleError} fallback={fallback}>
      {children}
    </ErrorBoundaryClass>
  );
}
