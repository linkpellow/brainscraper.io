/**
 * Custom hook for managing pipeline state and operations
 */

import { useState, useCallback } from 'react';
import type { LockedStep } from '../types';
import { extractVariablesFromResponse, findDependencies } from '../pipeline-utils';

export function usePipeline() {
  const [lockedSteps, setLockedSteps] = useState<LockedStep[]>([]);
  const [currentStepFocus, setCurrentStepFocus] = useState(1);
  const [pipelineCollapsed, setPipelineCollapsed] = useState(false);

  const lockCurrentStep = useCallback((
    stepNumber: number,
    endpoint: string,
    method: string,
    code: string,
    response: any,
    onStepLocked?: (stepNumber: number) => void
  ) => {
    const extractedVars = extractVariablesFromResponse(response);
    setLockedSteps(prev => {
      const newStep: LockedStep = {
        id: `step-${stepNumber}`,
        stepNumber,
        endpoint,
        method,
        code,
        response,
        extractedVars,
        dependencies: findDependencies(code, prev),
        lockedAt: Date.now(),
        status: 'success',
      };
      setCurrentStepFocus(stepNumber + 1);
      onStepLocked?.(stepNumber);
      return [...prev, newStep];
    });
  }, []);

  const exportWorkflow = useCallback((goal: string) => {
    const workflow = { goal, steps: lockedSteps };
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lockedSteps]);

  return {
    lockedSteps,
    currentStepFocus,
    pipelineCollapsed,
    setPipelineCollapsed,
    lockCurrentStep,
    exportWorkflow,
    setCurrentStepFocus,
  };
}
