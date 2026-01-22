/**
 * Custom hook for managing test execution state and operations
 */

import { useState, useCallback } from 'react';
import type { TestResult, CodeSnippetLang, EndpointData } from '../types';
import { getAllAvailableVariables } from '../pipeline-utils';
import type { LockedStep } from '../types';

export function useTestExecution(lockedSteps: LockedStep[]) {
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [successValidation, setSuccessValidation] = useState<any>(null);

  const executeCode = useCallback(async (
    code: string,
    language: CodeSnippetLang,
    selectedEndpoint: EndpointData | null
  ) => {
    if (!code || !selectedEndpoint) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/execute-snippet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code, 
          language, 
          variables: getAllAvailableVariables(lockedSteps) 
        }),
      });
      const data = await response.json();
      if (data.ok) setTestResult(data.result);
    } catch (err) { 
      console.error(err); 
    } finally { 
      setTestLoading(false); 
    }
  }, [lockedSteps]);

  return {
    testResult,
    testLoading,
    currentCode,
    successValidation,
    setCurrentCode,
    setSuccessValidation,
    executeCode,
    setTestResult,
  };
}
