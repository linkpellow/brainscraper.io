/**
 * Auto-Retry Logic with Intelligent Backoff
 * Handles failures gracefully with exponential backoff and jitter
 */

export type RetryOptions = {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: any) => void;
};

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  onRetry: () => {},
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  options: Required<RetryOptions>
): number {
  const baseDelay = Math.min(
    options.initialDelay * Math.pow(options.backoffMultiplier, attempt),
    options.maxDelay
  );
  
  if (options.jitter) {
    // Add random jitter (±25%)
    const jitterRange = baseDelay * 0.25;
    return baseDelay + (Math.random() * jitterRange * 2 - jitterRange);
  }
  
  return baseDelay;
}

/**
 * Determine if error is retryable
 */
function isRetryable(
  error: any,
  options: Required<RetryOptions>
): boolean {
  // Network errors
  if (error.name === 'NetworkError' || error.message?.includes('network')) {
    return true;
  }
  
  // Timeout errors
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return true;
  }
  
  // HTTP status codes
  if (error.status && options.retryableStatuses.includes(error.status)) {
    return true;
  }
  
  // Response status
  if (error.response?.status && options.retryableStatuses.includes(error.response.status)) {
    return true;
  }
  
  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < opts.maxRetries && isRetryable(error, opts)) {
        const delay = calculateDelay(attempt, opts);
        
        // Call onRetry callback
        opts.onRetry(attempt + 1, error);
        
        console.log(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed. Retrying in ${Math.round(delay)}ms...`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Not retryable or max retries reached
        break;
      }
    }
  }
  
  // All retries failed
  throw lastError;
}

/**
 * Rate limiter with token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }
  
  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    
    // Need to wait for next token
    const timeToWait = (1 - this.tokens) / this.refillRate * 1000;
    await new Promise(resolve => setTimeout(resolve, timeToWait));
    
    this.tokens = 0;
  }
  
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Circuit breaker pattern
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 60000, // 1 minute
    private successThreshold: number = 2
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      
      if (elapsed >= this.resetTimeout) {
        console.log('[Circuit Breaker] Transitioning to half-open state');
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN. Service temporarily unavailable.');
      }
    }
    
    try {
      const result = await fn();
      
      // Success
      if (this.state === 'half-open') {
        if (--this.failureCount <= 0) {
          console.log('[Circuit Breaker] Transitioning to closed state');
          this.state = 'closed';
          this.failureCount = 0;
        }
      } else {
        this.failureCount = Math.max(0, this.failureCount - 1);
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.failureThreshold) {
        console.log('[Circuit Breaker] Transitioning to open state');
        this.state = 'open';
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
    };
  }
  
  reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Example usage for API requests
 */
export async function executeWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions?: RetryOptions
): Promise<Response> {
  return retryWithBackoff(async () => {
    const response = await fetch(url, options);
    
    if (!response.ok && retryOptions?.retryableStatuses?.includes(response.status)) {
      throw { status: response.status, statusText: response.statusText };
    }
    
    return response;
  }, retryOptions);
}
