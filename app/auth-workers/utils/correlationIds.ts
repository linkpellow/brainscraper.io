/**
 * Correlation ID System
 * 
 * Generates and manages correlation IDs for event tracking:
 * - runId: One per workflow/session run
 * - requestId: One per API call
 * - workerId: Auth worker instance
 * - traceId: Optional distributed tracing ID
 * - stepId: Current pipeline step
 */

let currentRunId: string | null = null;
let currentStepId: string | null = null;
let currentWorkerId: string | null = null;
const requestIdCounter = new Map<string, number>(); // runId -> counter

/**
 * Generate a unique run ID
 */
export function generateRunId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `run_${timestamp}_${random}`;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(runId?: string): string {
  const run = runId || currentRunId || 'global';
  const counter = (requestIdCounter.get(run) || 0) + 1;
  requestIdCounter.set(run, counter);
  const timestamp = Date.now();
  return `req_${run}_${counter}_${timestamp}`;
}

/**
 * Generate a trace ID (optional, for distributed tracing)
 */
export function generateTraceId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `trace_${timestamp}_${random}`;
}

/**
 * Set the current run ID (called when starting a workflow/session)
 */
export function setCurrentRunId(runId: string): void {
  currentRunId = runId;
  // Reset request counter for new run
  requestIdCounter.set(runId, 0);
}

/**
 * Get the current run ID
 */
export function getCurrentRunId(): string | null {
  return currentRunId;
}

/**
 * Set the current step ID
 */
export function setCurrentStepId(stepId: string | null): void {
  currentStepId = stepId;
}

/**
 * Get the current step ID
 */
export function getCurrentStepId(): string | null {
  return currentStepId;
}

/**
 * Set the current worker ID
 */
export function setCurrentWorkerId(workerId: string | null): void {
  currentWorkerId = workerId;
}

/**
 * Get the current worker ID
 */
export function getCurrentWorkerId(): string | null {
  return currentWorkerId;
}

/**
 * Get all current correlation IDs
 */
export function getCorrelationIds(): {
  runId?: string;
  stepId?: string;
  workerId?: string;
} {
  return {
    runId: currentRunId ?? undefined,
    stepId: currentStepId ?? undefined,
    workerId: currentWorkerId ?? undefined,
  };
}

/**
 * Clear correlation IDs (on session end)
 */
export function clearCorrelationIds(): void {
  currentRunId = null;
  currentStepId = null;
  currentWorkerId = null;
}
