/**
 * Sequential Validator - Ensures workflow reliability
 * Tests workflows multiple times in sequence to verify consistency
 * Required for Mode #1: Full Map
 */

export type LockedStep = {
  id: string;
  stepNumber: number;
  endpoint: string;
  method: string;
  payload?: any;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  extractedVars: Record<string, any>;
  dependencies: string[];
  expectedStatus?: number;
  expectedResult?: string;
  formState?: {
    viewstate?: string;
    viewstateGenerator?: string;
    eventValidation?: string;
    eventTarget?: string;
    eventArgument?: string;
    customFields?: Record<string, string>;
  };
};

export type ValidationResult = {
  success: boolean;
  stepNumber: number;
  attempt: number;
  statusCode?: number;
  responseTime: number;
  error?: string;
  extractedData?: Record<string, any>;
  formStateUpdated?: boolean;
};

export type SequentialTestResult = {
  allPassed: boolean;
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  steps: Array<{
    stepNumber: number;
    passRate: number;
    attempts: ValidationResult[];
  }>;
  averageResponseTime: number;
  reliability: number; // 0-1 score
};

/**
 * Execute a single step and capture its result
 */
async function executeStep(
  step: LockedStep,
  previousStepResults: Map<number, ValidationResult>,
  attemptNumber: number
): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    // Build headers with dependencies
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...step.headers
    };

    // Inject variables from previous steps
    let payload = step.payload;
    if (step.dependencies.length > 0) {
      for (const depVar of step.dependencies) {
        // Find the variable in previous results
        for (const [_, result] of previousStepResults) {
          if (result.extractedData?.[depVar]) {
            // Replace placeholder with actual value
            if (typeof payload === 'string') {
              payload = payload.replace(`{{${depVar}}}`, result.extractedData[depVar]);
            }
          }
        }
      }
    }

    // Add form state if present (for .ASPX)
    if (step.formState) {
      const formParams = new URLSearchParams(payload);
      if (step.formState.viewstate) {
        formParams.set('__VIEWSTATE', step.formState.viewstate);
      }
      if (step.formState.viewstateGenerator) {
        formParams.set('__VIEWSTATEGENERATOR', step.formState.viewstateGenerator);
      }
      if (step.formState.eventValidation) {
        formParams.set('__EVENTVALIDATION', step.formState.eventValidation);
      }
      if (step.formState.eventTarget) {
        formParams.set('__EVENTTARGET', step.formState.eventTarget);
      }
      if (step.formState.eventArgument) {
        formParams.set('__EVENTARGUMENT', step.formState.eventArgument);
      }
      payload = formParams.toString();
    }

    // Execute request
    const response = await fetch(step.endpoint, {
      method: step.method,
      headers,
      body: step.method !== 'GET' ? payload : undefined,
      credentials: 'include' // Include cookies
    });

    const responseText = await response.text();
    const responseTime = Date.now() - startTime;

    // Extract variables from response
    const extractedData: Record<string, any> = {};
    
    // Extract new form state if this is .ASPX
    const viewstateMatch = responseText.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/);
    if (viewstateMatch) {
      extractedData['__VIEWSTATE'] = viewstateMatch[1];
    }

    const eventValMatch = responseText.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/);
    if (eventValMatch) {
      extractedData['__EVENTVALIDATION'] = eventValMatch[1];
    }

    // Check for expected patterns
    let success = response.ok;
    if (step.expectedStatus) {
      success = success && response.status === step.expectedStatus;
    }
    if (step.expectedResult) {
      success = success && responseText.includes(step.expectedResult);
    }

    return {
      success,
      stepNumber: step.stepNumber,
      attempt: attemptNumber,
      statusCode: response.status,
      responseTime,
      extractedData,
      formStateUpdated: !!viewstateMatch
    };

  } catch (error) {
    return {
      success: false,
      stepNumber: step.stepNumber,
      attempt: attemptNumber,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test a complete workflow sequentially (all steps in order)
 */
async function testWorkflowOnce(
  steps: LockedStep[],
  attemptNumber: number
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const resultMap = new Map<number, ValidationResult>();

  for (const step of steps) {
    const result = await executeStep(step, resultMap, attemptNumber);
    results.push(result);
    resultMap.set(step.stepNumber, result);

    // If step fails, stop the workflow
    if (!result.success) {
      break;
    }

    // Update next step's form state if extracted
    const nextStepIndex = steps.findIndex(s => s.stepNumber === step.stepNumber + 1);
    if (nextStepIndex !== -1 && result.extractedData) {
      const nextStep = steps[nextStepIndex];
      if (nextStep.formState && result.extractedData['__VIEWSTATE']) {
        nextStep.formState.viewstate = result.extractedData['__VIEWSTATE'];
      }
      if (nextStep.formState && result.extractedData['__EVENTVALIDATION']) {
        nextStep.formState.eventValidation = result.extractedData['__EVENTVALIDATION'];
      }
    }
  }

  return results;
}

/**
 * Test workflow N times in sequence and analyze reliability
 */
export async function validateSequentially(
  steps: LockedStep[],
  numAttempts: number = 2
): Promise<SequentialTestResult> {
  const allResults: ValidationResult[][] = [];

  console.log(`[SequentialValidator] Testing workflow ${numAttempts}x in sequence...`);

  // Run workflow multiple times
  for (let attempt = 1; attempt <= numAttempts; attempt++) {
    console.log(`[SequentialValidator] Attempt ${attempt}/${numAttempts}`);
    const results = await testWorkflowOnce(steps, attempt);
    allResults.push(results);

    // If workflow failed, no need to continue
    const failed = results.some(r => !r.success);
    if (failed) {
      console.warn(`[SequentialValidator] Workflow failed on attempt ${attempt}`);
    }
  }

  // Analyze results per step
  const stepAnalysis = steps.map(step => {
    const attempts = allResults
      .map(run => run.find(r => r.stepNumber === step.stepNumber))
      .filter(Boolean) as ValidationResult[];

    const passed = attempts.filter(a => a.success).length;
    const passRate = attempts.length > 0 ? passed / attempts.length : 0;

    return {
      stepNumber: step.stepNumber,
      passRate,
      attempts
    };
  });

  // Calculate overall metrics
  const totalAttempts = allResults.length * steps.length;
  const successfulAttempts = allResults.flat().filter(r => r.success).length;
  const failedAttempts = totalAttempts - successfulAttempts;

  const allResponseTimes = allResults.flat().map(r => r.responseTime);
  const averageResponseTime = allResponseTimes.length > 0
    ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
    : 0;

  // Calculate reliability (all steps must pass on all attempts)
  const allPassed = allResults.every(run => 
    run.length === steps.length && run.every(r => r.success)
  );

  const reliability = successfulAttempts / totalAttempts;

  return {
    allPassed,
    totalAttempts,
    successfulAttempts,
    failedAttempts,
    steps: stepAnalysis,
    averageResponseTime,
    reliability
  };
}

/**
 * Test a single step multiple times (useful for debugging)
 */
export async function validateSingleStep(
  step: LockedStep,
  numAttempts: number = 2
): Promise<SequentialTestResult> {
  return validateSequentially([step], numAttempts);
}

/**
 * Verify that workflow can persist indefinitely (auth/cookies work)
 * Tests with longer delays between attempts to simulate real-world usage
 */
export async function validatePersistence(
  steps: LockedStep[],
  numAttempts: number = 3,
  delayBetweenAttemptsMs: number = 5000
): Promise<SequentialTestResult> {
  const allResults: ValidationResult[][] = [];

  console.log(`[SequentialValidator] Testing persistence with ${delayBetweenAttemptsMs}ms delays...`);

  for (let attempt = 1; attempt <= numAttempts; attempt++) {
    console.log(`[SequentialValidator] Persistence test ${attempt}/${numAttempts}`);
    
    const results = await testWorkflowOnce(steps, attempt);
    allResults.push(results);

    // Wait between attempts to test session persistence
    if (attempt < numAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenAttemptsMs));
    }
  }

  // Same analysis as validateSequentially
  const stepAnalysis = steps.map(step => {
    const attempts = allResults
      .map(run => run.find(r => r.stepNumber === step.stepNumber))
      .filter(Boolean) as ValidationResult[];

    const passed = attempts.filter(a => a.success).length;
    const passRate = attempts.length > 0 ? passed / attempts.length : 0;

    return {
      stepNumber: step.stepNumber,
      passRate,
      attempts
    };
  });

  const totalAttempts = allResults.length * steps.length;
  const successfulAttempts = allResults.flat().filter(r => r.success).length;
  const failedAttempts = totalAttempts - successfulAttempts;

  const allResponseTimes = allResults.flat().map(r => r.responseTime);
  const averageResponseTime = allResponseTimes.length > 0
    ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
    : 0;

  const allPassed = allResults.every(run => 
    run.length === steps.length && run.every(r => r.success)
  );

  const reliability = successfulAttempts / totalAttempts;

  return {
    allPassed,
    totalAttempts,
    successfulAttempts,
    failedAttempts,
    steps: stepAnalysis,
    averageResponseTime,
    reliability
  };
}
